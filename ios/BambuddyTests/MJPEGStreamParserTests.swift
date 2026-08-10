import XCTest
@testable import Bambuddy

final class MJPEGStreamParserTests: XCTestCase {
  private let jpeg = Data([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9])

  func testParsesFrameSplitAcrossEveryByte() throws {
    let parser = try MJPEGStreamParser(boundary: "frame")
    let payload = multipart([jpeg], boundary: "frame", includeLengths: true)
    var frames: [Data] = []

    for byte in payload {
      frames.append(contentsOf: try parser.append(Data([byte])))
    }

    XCTAssertEqual(frames, [jpeg])
  }

  func testParsesMultipleFramesWithoutContentLength() throws {
    let parser = try MJPEGStreamParser(boundary: "frame")
    let second = Data([0xff, 0xd8, 0x03, 0x04, 0xff, 0xd9])

    let frames = try parser.append(multipart([jpeg, second], boundary: "frame", includeLengths: false))

    XCTAssertEqual(frames, [jpeg, second])
  }

  func testStreamsRapidFramesThroughCallbackWithoutAccumulatingAResultArray() throws {
    let parser = try MJPEGStreamParser(boundary: "frame")
    let frames = (0..<100).map {
      Data([0xff, 0xd8, UInt8($0), UInt8($0), 0xff, 0xd9])
    }
    var receivedCount = 0
    var latest: Data?

    try parser.append(multipart(frames, boundary: "frame", includeLengths: true)) { frame in
      receivedCount += 1
      latest = frame
    }

    XCTAssertEqual(receivedCount, frames.count)
    XCTAssertEqual(latest, frames.last)
  }

  func testRejectsMalformedJPEG() throws {
    let parser = try MJPEGStreamParser(boundary: "frame")

    XCTAssertThrowsError(
      try parser.append(multipart([Data("not-jpeg".utf8)], boundary: "frame", includeLengths: true))
    ) {
      XCTAssertEqual($0 as? MJPEGStreamParserError, .jpegInvalid)
    }
  }

  func testRejectsOversizeDeclaredFrame() throws {
    let parser = try MJPEGStreamParser(boundary: "frame")
    let payload = Data(
      "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: \(MJPEGStreamParser.maximumFrameBytes + 1)\r\n\r\n"
        .utf8
    )

    XCTAssertThrowsError(try parser.append(payload)) {
      XCTAssertEqual($0 as? MJPEGStreamParserError, .frameTooLarge)
    }
  }

  func testRejectsHeaderAndRollingBufferLimits() throws {
    let headerParser = try MJPEGStreamParser(boundary: "frame")
    var oversizedHeader = Data("--frame\r\nX: ".utf8)
    oversizedHeader.append(Data(repeating: 0x61, count: MJPEGStreamParser.maximumHeaderBytes))
    XCTAssertThrowsError(try headerParser.append(oversizedHeader)) {
      XCTAssertEqual($0 as? MJPEGStreamParserError, .headerTooLarge)
    }

    let bufferParser = try MJPEGStreamParser(boundary: "frame")
    XCTAssertThrowsError(
      try bufferParser.append(Data(repeating: 0x61, count: MJPEGStreamParser.maximumBufferBytes + 1))
    ) {
      XCTAssertEqual($0 as? MJPEGStreamParserError, .bufferLimit)
    }
  }

  func testRejectsMissingBoundaryValue() {
    XCTAssertThrowsError(try MJPEGStreamParser(boundary: " \r\n")) {
      XCTAssertEqual($0 as? MJPEGStreamParserError, .boundaryMissing)
    }
  }

  private func multipart(_ frames: [Data], boundary: String, includeLengths: Bool) -> Data {
    var result = Data()
    for frame in frames {
      result.append(Data("--\(boundary)\r\nContent-Type: image/jpeg\r\n".utf8))
      if includeLengths {
        result.append(Data("Content-Length: \(frame.count)\r\n".utf8))
      }
      result.append(Data("\r\n".utf8))
      result.append(frame)
      result.append(Data("\r\n".utf8))
    }
    result.append(Data("--\(boundary)--\r\n".utf8))
    return result
  }
}
