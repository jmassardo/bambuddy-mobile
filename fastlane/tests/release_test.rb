require "minitest/autorun"
require "fastlane"
require "spaceship"
require "supply"
require "supply/options"

class ReleaseLanesTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  FASTFILE = File.join(ROOT, "fastlane/Fastfile")
  ENV_NAMES = %w[
    RELEASE_VERSION BUILD_NUMBER RELEASE_STORE_METADATA_PATH
    ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_CONTENT ASC_KEY_FILEPATH
    MATCH_PASSWORD MATCH_GIT_AUTHORIZATION MATCH_GIT_BASIC_AUTHORIZATION
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH
    BAMBUDDY_RELEASE_STORE_FILE BAMBUDDY_RELEASE_STORE_PASSWORD
    BAMBUDDY_RELEASE_KEY_ALIAS BAMBUDDY_RELEASE_KEY_PASSWORD
  ].freeze
  Build = Struct.new(:id, :version, :pre_release_version, :processing_state, :expired, :build_beta_detail, keyword_init: true)
  PreRelease = Struct.new(:version, :platform)
  BetaDetail = Struct.new(:internal_build_state)
  StoreVersion = Struct.new(:version_string, :app_version_state, :updates, :build, :release_type) do
    def update(attributes:)
      self.updates ||= []
      updates << attributes
    end

    def get_app_store_version_localizations
      [self]
    end
  end
  Release = Struct.new(:version_codes, :status)
  Track = Struct.new(:track, :releases)
  App = Struct.new(:id, :versions) do
    def get_app_store_versions(filter:)
      raise "Wrong platform query" unless filter == { platform: "IOS" }
      versions
    end

    def ensure_version!(version, platform:)
      raise "Wrong platform" unless platform == "IOS"
      versions << StoreVersion.new(version, "PREPARE_FOR_SUBMISSION")
    end

    def get_edit_app_store_version(platform:)
      raise "Wrong platform" unless platform == "IOS"
      versions.find { |version| version.app_version_state == "PREPARE_FOR_SUBMISSION" }
    end
  end

  class ReadOnlyPlayClient
    attr_reader :events

    def initialize(tracks, error: nil)
      @tracks = tracks
      @error = error
      @events = []
    end

    def begin_edit(package_name:)
      raise "Wrong app" unless package_name == "com.dxrf.bambuddy"
      @events << :begin
    end

    def tracks(*names)
      raise "Incomplete track query" unless names == %w[internal alpha beta production]
      @events << :read
      raise @error if @error
      @tracks
    end

    def abort_current_edit
      @events << :abort
    end
  end

  def setup
    @previous_env = ENV_NAMES.to_h { |name| [name, ENV[name]] }
    ENV_NAMES.each { |name| ENV.delete(name) }
    ENV.update(
      "RELEASE_VERSION" => "1.2.4",
      "BUILD_NUMBER" => "87",
      "ASC_KEY_ID" => "test-key-id",
      "ASC_ISSUER_ID" => "test-issuer",
      "ASC_KEY_CONTENT" => "test-key-content",
      "MATCH_PASSWORD" => "test-match-password",
      "MATCH_GIT_AUTHORIZATION" => "test-git-authorization",
      # Existing JSON is only a path fixture; authentication is intercepted.
      "GOOGLE_SERVICE_ACCOUNT_KEY_PATH" => File.join(ROOT, "package.json"),
      "BAMBUDDY_RELEASE_STORE_FILE" => FASTFILE,
      "BAMBUDDY_RELEASE_STORE_PASSWORD" => "test-store-password",
      "BAMBUDDY_RELEASE_KEY_ALIAS" => "test-key-alias",
      "BAMBUDDY_RELEASE_KEY_PASSWORD" => "test-key-password"
    )
    @actions = []
    @file = Fastlane::FastFile.new
    @file.define_singleton_method(:default_platform) { |_platform| }
    @file.runner = Fastlane::Runner.new
    @file.runner.define_singleton_method(:trigger_action_by_name) do |name, *_args|
      raise "Forbidden/unintercepted action or lane: #{name}"
    end
    @file.parse(File.read(FASTFILE), FASTFILE)
    @file.define_singleton_method(:candidate_release_notes) { |_identity| "Exact candidate release notes" }
    %i[app_store_connect_api_key setup_ci match build_ios_app gradle upload_to_testflight upload_to_app_store upload_to_play_store].each do |action|
      actions = @actions
      @file.define_singleton_method(action) do |**options|
        actions << [action, options]
        action == :app_store_connect_api_key ? { key_id: "intercepted" } : nil
      end
    end
    @app = App.new("existing-app-id", [StoreVersion.new("1.2.3")])
    @builds = [ready_build]
    @tracks = [Track.new("internal", [Release.new(["87"], "completed")])]
    @build_queries = []
    @clients = []
  end

  def teardown
    @previous_env.each { |name, value| value.nil? ? ENV.delete(name) : ENV[name] = value }
    File.delete(@metadata_path) if @metadata_path && File.exist?(@metadata_path)
  end

  def ready_build(version: "1.2.4", number: "87", state: "VALID", expired: false, beta: "READY_FOR_BETA_TESTING", platform: "IOS")
    Build.new(
      id: "build-#{version}-#{number}",
      version: number,
      pre_release_version: PreRelease.new(version, platform),
      processing_state: state,
      expired: expired,
      build_beta_detail: BetaDetail.new(beta)
    )
  end

  def run_lane(platform, lane, play_error: nil)
    app_lookup = lambda do |identifier|
      assert_equal "com.dxrf.bambuddy", identifier
      @app
    end
    build_lookup = lambda do |**query|
      @build_queries << query
      @builds
    end
    client_factory = lambda do |params:|
      assert_equal File.join(ROOT, "package.json"), params[:json_key]
      client = ReadOnlyPlayClient.new(@tracks, error: play_error)
      @clients << client
      client
    end
    Spaceship::ConnectAPI::App.stub(:find, app_lookup) do
      Spaceship::ConnectAPI::Build.stub(:all, build_lookup) do
        Supply::Client.stub(:make_from_config, client_factory) do
          Dir.chdir(File.join(ROOT, "fastlane")) { @file.runner.lanes.fetch(platform).fetch(lane).call({}) }
        end
      end
    end
  end

  def action_options(action)
    @actions.find { |name, _options| name == action }&.last
  end

  def assert_only_actions(*names)
    assert_equal names, @actions.map(&:first)
  end

  def assert_release_failure(platform, lane, message)
    error = assert_raises(FastlaneCore::Interface::FastlaneError) { run_lane(platform, lane) }
    assert_match message, error.message
    refute @actions.any? { |action, _| %i[upload_to_app_store upload_to_play_store build_ios_app gradle match].include?(action) }
  end

  def test_ios_promotes_exact_processed_build_without_binary_or_signing
    run_lane(:ios, :promote)
    assert_only_actions :app_store_connect_api_key, :upload_to_app_store
    assert_equal(
      { app_id: "existing-app-id", version: "1.2.4", build_number: "87", platform: "IOS" },
      @build_queries.fetch(0)
    )
    options = action_options(:upload_to_app_store)
    assert_equal "1.2.4", options[:app_version]
    assert_equal "87", options[:build_number]
    assert_equal true, options[:skip_binary_upload]
    assert_equal true, options[:submit_for_review]
    assert_equal true, options[:automatic_release]
    assert_equal true, options[:skip_app_version_update]
    assert_equal(
      [{ releaseType: "AFTER_APPROVAL" }, { whatsNew: "Exact candidate release notes" }],
      @app.versions.last.updates
    )
    refute options.key?(:ipa)
    refute options.key?(:pkg)
    assert_equal "test-key-content", action_options(:app_store_connect_api_key)[:key_content]
    refute action_options(:app_store_connect_api_key).key?(:key_filepath)
  end

  def test_ios_missing_or_ambiguous_build_is_never_submitted
    [[], [ready_build, ready_build]].each do |builds|
      @builds = builds
      assert_release_failure(:ios, :promote, /not found uniquely/)
    end
  end

  def test_ios_rejects_wrong_version_number_and_platform_even_if_api_filter_is_ignored
    [ready_build(version: "1.2.5"), ready_build(number: "88"), ready_build(platform: "MAC_OS")].each do |build|
      @builds = [build]
      assert_release_failure(:ios, :promote, /not found uniquely/)
    end
  end

  def test_ios_unprocessed_invalid_expired_or_compliance_blocked_build_is_never_submitted
    [
      ready_build(state: "PROCESSING"), ready_build(state: "INVALID"),
      ready_build(state: "FAILED"), ready_build(expired: true),
      ready_build(beta: "MISSING_EXPORT_COMPLIANCE"),
      ready_build(beta: "IN_EXPORT_COMPLIANCE_REVIEW"),
      ready_build(beta: nil)
    ].each do |build|
      @builds = [build]
      assert_release_failure(:ios, :promote, /not processed, accepted/)
    end
  end

  def test_ios_does_not_overwrite_an_unrelated_editable_version_or_resubmit_a_version_in_review
    @app.versions = [StoreVersion.new("1.2.5", "PREPARE_FOR_SUBMISSION")]
    assert_release_failure(:ios, :promote, /different editable/)
    assert_nil @app.versions.first.updates
    @app.versions = [StoreVersion.new("1.2.4", "IN_REVIEW")]
    assert_release_failure(:ios, :promote, /does not reference the exact/)
    assert_nil @app.versions.first.updates
  end

  def test_exact_changelog_notes_exclude_other_releases_and_reference_links
    source = "# Changelog\n\n## [Unreleased]\n\n- Future change\n\n" \
             "## [1.2.4] - 2026-11-01\n\n### Fixed\n\n- Candidate change\n\n" \
             "## [1.2.3]\n\n- Old change\n\n[1.2.4]: https://example.test/release\n"
    assert_equal "Fixed\n\n- Candidate change", @file.notes_from_changelog("1.2.4", source)
    assert_raises(FastlaneCore::Interface::FastlaneError) { @file.notes_from_changelog("1.2.5", source) }
    assert_raises(FastlaneCore::Interface::FastlaneError) { @file.notes_from_changelog("1.2.4", "## [1.2.4]\n\n") }
    notes = @file.notes_from_changelog("1.2.4", "## [1.2.4]\n\n#{'x' * 4001}\n")
    assert_equal 4000, notes.length
    assert notes.end_with?("…")
  end

  def test_ios_retry_does_not_resubmit_exact_submitted_or_published_build
    %w[WAITING_FOR_REVIEW IN_REVIEW ACCEPTED PENDING_APPLE_RELEASE PROCESSING_FOR_DISTRIBUTION READY_FOR_DISTRIBUTION REPLACED_WITH_NEW_VERSION].each do |state|
      @actions.clear
      @builds = [ready_build(expired: true, beta: "EXPIRED")]
      @app.versions = [StoreVersion.new("1.2.4", state, nil, @builds.first, "AFTER_APPROVAL")]
      run_lane(:ios, :promote)
      assert_only_actions :app_store_connect_api_key
      assert_nil @app.versions.first.updates
    end
  end

  def test_ios_retry_fails_if_submitted_version_is_bound_to_another_build_or_manual_release
    @app.versions = [StoreVersion.new("1.2.4", "IN_REVIEW", nil, ready_build(number: "88"), "AFTER_APPROVAL")]
    assert_release_failure(:ios, :promote, /different build/)
    @app.versions = [StoreVersion.new("1.2.4", "IN_REVIEW", nil, ready_build, "MANUAL")]
    assert_release_failure(:ios, :promote, /automatic public release/)
    wrong_id = ready_build
    wrong_id.id = "another-build-id"
    @app.versions = [StoreVersion.new("1.2.4", "IN_REVIEW", nil, wrong_id, "AFTER_APPROVAL")]
    assert_release_failure(:ios, :promote, /does not reference the exact/)
  end

  def test_android_promotes_only_exact_internal_version_without_build_or_upload
    @tracks.first.releases << Release.new(["88"], "completed")
    run_lane(:android, :promote)
    assert_only_actions :upload_to_play_store
    options = action_options(:upload_to_play_store)
    assert_equal 87, options[:version_code]
    assert_equal "internal", options[:track]
    assert_equal "production", options[:track_promote_to]
    assert_equal "completed", options[:release_status]
    assert_equal "completed", options[:track_promote_release_status]
    assert_equal true, options[:skip_upload_apk]
    assert_equal true, options[:skip_upload_aab]
    refute options.key?(:apk)
    refute options.key?(:aab)
    assert_equal [:begin, :read, :abort], @clients.fetch(0).events
  end

  def test_android_missing_wrong_or_not_ready_build_cannot_promote
    [[], [Release.new(["88"], "completed")], [Release.new(["87"], "draft")], [Release.new(["87"], "inProgress")]].each do |releases|
      @tracks.first.releases = releases
      assert_release_failure(:android, :promote, /missing or not ready/)
    end
  end

  def test_android_retry_reuses_completed_production_build_even_if_internal_was_replaced
    @tracks = [
      Track.new("internal", [Release.new(["88"], "completed")]),
      Track.new("production", [Release.new(["87"], "completed")])
    ]
    run_lane(:android, :promote)
    assert_empty @actions
    assert_equal [:begin, :read, :abort], @clients.first.events
  end

  def test_android_retry_rejects_incomplete_or_ambiguous_production_build
    [["inProgress"], ["draft"], ["completed", "completed"]].each do |statuses|
      @tracks = [Track.new("production", statuses.map { |status| Release.new(["87"], status) })]
      assert_release_failure(:android, :promote, /ambiguous or not fully released/)
    end
  end

  def test_android_refuses_mixed_release_and_ambiguous_build
    @tracks.first.releases = [Release.new(["87", "88"], "completed")]
    assert_release_failure(:android, :promote, /other builds/)
    @tracks.first.releases = [Release.new(["87"], "completed"), Release.new(["87"], "completed")]
    assert_release_failure(:android, :promote, /missing or not ready/)
  end

  def test_query_uses_highest_semver_and_all_numeric_store_builds_without_upload
    @metadata_path = File.join(ROOT, "fastlane/tests/.release-metadata-#{Process.pid}.json")
    ENV["RELEASE_STORE_METADATA_PATH"] = @metadata_path
    @app.versions = %w[1.9.0 1.10.2 1.10.1 1.2.99].map { |version| StoreVersion.new(version) }
    @builds = [ready_build(number: "309", state: "PROCESSING"), ready_build(number: "1.3")]
    @tracks = [
      Track.new("internal", [Release.new(["87"], "completed")]),
      Track.new("alpha", [Release.new(["200"], "draft")]),
      Track.new("beta", [Release.new(["301"], "inProgress")]),
      Track.new("production", [Release.new(["250"], "completed")])
    ]
    run_lane(:ios, :release_metadata)
    assert_equal({ "store_version" => "1.10.2", "next_build_number" => 310 }, JSON.parse(File.read(@metadata_path)))
    assert_only_actions :app_store_connect_api_key
    assert_equal({ app_id: "existing-app-id", platform: "IOS" }, @build_queries.first)
    assert_equal [:begin, :read, :abort], @clients.first.events
  end

  def test_query_build_floor_includes_play_and_does_not_require_signing
    @metadata_path = File.join(ROOT, "fastlane/tests/.release-metadata-#{Process.pid}.json")
    ENV["RELEASE_STORE_METADATA_PATH"] = @metadata_path
    ENV.delete("MATCH_PASSWORD")
    ENV.delete("BAMBUDDY_RELEASE_STORE_FILE")
    @builds = []
    @tracks = [Track.new("production", [Release.new(["900"], "completed")])]
    run_lane(nil, :release_metadata)
    assert_equal 901, JSON.parse(File.read(@metadata_path))["next_build_number"]
    assert_only_actions :app_store_connect_api_key
  end

  def test_query_fails_on_missing_app_versions_invalid_versions_or_exhausted_numbers
    @metadata_path = File.join(ROOT, "fastlane/tests/.release-metadata-#{Process.pid}.json")
    ENV["RELEASE_STORE_METADATA_PATH"] = @metadata_path
    [[], [StoreVersion.new("1.2")], [StoreVersion.new("01.2.3")]].each do |versions|
      @app.versions = versions
      assert_release_failure(nil, :release_metadata, /three-part/)
      refute File.exist?(@metadata_path)
    end
    @app.versions = [StoreVersion.new("1.2.3")]
    @builds = [ready_build(number: "2100000000")]
    assert_release_failure(nil, :release_metadata, /range is exhausted/)
    refute File.exist?(@metadata_path)
  end

  def test_play_read_aborts_disposable_edit_on_api_error_and_never_promotes
    error = assert_raises(RuntimeError) { run_lane(:android, :promote, play_error: RuntimeError.new("Store query failed")) }
    assert_equal "Store query failed", error.message
    assert_equal [:begin, :read, :abort], @clients.first.events
    assert_empty @actions
  end

  def test_missing_credentials_and_invalid_identity_fail_closed
    ENV.delete("ASC_KEY_CONTENT")
    assert_release_failure(:ios, :promote, /ASC_KEY_CONTENT/)
    ENV["ASC_KEY_CONTENT"] = "test-key-content"
    ENV.delete("GOOGLE_SERVICE_ACCOUNT_KEY_PATH")
    assert_release_failure(:android, :promote, /GOOGLE_SERVICE_ACCOUNT_KEY_PATH/)
    ENV["BUILD_NUMBER"] = "latest"
    assert_release_failure(:ios, :promote, /BUILD_NUMBER/)
    ENV["BUILD_NUMBER"] = "87"
    ENV["RELEASE_VERSION"] = "1.2"
    assert_release_failure(:ios, :promote, /RELEASE_VERSION/)
  end

  def set_native_identity(platform)
    ENV["RELEASE_VERSION"] = JSON.parse(File.read(File.join(ROOT, "package.json")))["version"]
    native_file = platform == :ios ? "ios/Bambuddy.xcodeproj/project.pbxproj" : "android/app/build.gradle"
    pattern = platform == :ios ? /CURRENT_PROJECT_VERSION = (\d+);/ : /\bversionCode\s+(\d+)/
    ENV["BUILD_NUMBER"] = File.read(File.join(ROOT, native_file)).match(pattern)[1]
    @builds = [ready_build(version: ENV["RELEASE_VERSION"], number: ENV["BUILD_NUMBER"])]
    @tracks = [Track.new("internal", [Release.new([ENV["BUILD_NUMBER"]], "completed")])]
  end

  def test_ios_candidate_builds_and_uploads_once_waits_and_uses_exact_committed_number
    set_native_identity(:ios)
    run_lane(:ios, :release_candidate)
    assert_only_actions :app_store_connect_api_key, :setup_ci, :match, :build_ios_app, :upload_to_testflight
    assert_equal true, action_options(:setup_ci)[:force]
    assert_equal true, action_options(:match)[:readonly]
    assert_equal "test-git-authorization", action_options(:match)[:git_basic_authorization]
    build_options = action_options(:build_ios_app)
    assert_equal "Release", build_options[:configuration]
    assert_equal "Bambuddy.ipa", build_options[:output_name]
    assert_equal "CURRENT_PROJECT_VERSION=#{ENV['BUILD_NUMBER']}", build_options[:xcargs]
    upload_options = action_options(:upload_to_testflight)
    assert_equal false, upload_options[:skip_waiting_for_build_processing]
    assert_equal ENV["RELEASE_VERSION"], upload_options[:app_version]
    assert_equal ENV["BUILD_NUMBER"], upload_options[:build_number]
  end

  def test_ios_candidate_accepts_workflow_mapped_match_authorization
    set_native_identity(:ios)
    ENV.delete("MATCH_GIT_AUTHORIZATION")
    ENV["MATCH_GIT_BASIC_AUTHORIZATION"] = "mapped-test-authorization"
    run_lane(:ios, :release_candidate)
    assert_equal "mapped-test-authorization", action_options(:match)[:git_basic_authorization]
  end

  def test_android_candidate_builds_and_uploads_once_and_requires_production_signing
    set_native_identity(:android)
    run_lane(:android, :release_candidate)
    assert_only_actions :gradle, :upload_to_play_store
    assert_equal "bundleRelease", action_options(:gradle)[:task]
    options = action_options(:upload_to_play_store)
    assert_equal "internal", options[:track]
    assert_equal "completed", options[:release_status]
    assert_equal "android/app/build/outputs/bundle/release/app-release.aab", options[:aab]
    assert_equal ENV["BUILD_NUMBER"].to_i, options[:version_code]
    @actions.clear
    ENV.delete("BAMBUDDY_RELEASE_KEY_PASSWORD")
    assert_release_failure(:android, :release_candidate, /BAMBUDDY_RELEASE_KEY_PASSWORD/)
  end

  def test_candidate_wrong_committed_metadata_cannot_start_a_build
    %i[ios android].each do |platform|
      set_native_identity(platform)
      ENV["BUILD_NUMBER"] = (ENV["BUILD_NUMBER"].to_i + 1).to_s
      assert_release_failure(platform, :release_candidate, /metadata does not match/)
    end
  end
end
