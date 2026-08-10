import Foundation

enum MJPEGStreamParserError: Error, Equatable {
  case boundaryMissing
  case headerTooLarge
  case frameTooLarge
  case bufferLimit
  case jpegInvalid
}

final class MJPEGStreamParser {
  static let maximumHeaderBytes = 16 * 1024
  static let maximumFrameBytes = 5 * 1024 * 1024
  static let maximumBufferBytes = 6 * 1024 * 1024

  private enum State {
    case boundary
    case headers
    case body(contentLength: Int?)
  }

  private let boundaryLine: Data
  private let bodyDelimiter: Data
  private var buffer = Data()
  private var state: State = .boundary

  init(boundary: String) throws {
    let normalized = boundary.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty,
          normalized.utf8.count <= Self.maximumHeaderBytes,
          !normalized.contains("\r"),
          !normalized.contains("\n") else {
      throw MJPEGStreamParserError.boundaryMissing
    }
    boundaryLine = Data("--\(normalized)".utf8)
    bodyDelimiter = Data("\r\n--\(normalized)".utf8)
  }

  func append(_ data: Data) throws -> [Data] {
    var frames: [Data] = []
    try append(data) { frames.append($0) }
    return frames
  }

  func append(_ data: Data, onFrame: (Data) throws -> Void) throws {
    guard buffer.count + data.count <= Self.maximumBufferBytes else {
      throw MJPEGStreamParserError.bufferLimit
    }
    buffer.append(data)

    parseLoop: while true {
      switch state {
      case .boundary:
        guard let boundaryRange = buffer.range(of: boundaryLine) else {
          if buffer.count > boundaryLine.count + 4 {
            let retained = min(buffer.count, boundaryLine.count + 4)
            buffer.removeFirst(buffer.count - retained)
          }
          break parseLoop
        }
        if boundaryRange.lowerBound > buffer.startIndex {
          buffer.removeSubrange(buffer.startIndex..<boundaryRange.lowerBound)
        }
        guard let lineEnd = buffer.range(of: Data("\r\n".utf8)) else {
          break parseLoop
        }
        let line = buffer[buffer.startIndex..<lineEnd.lowerBound]
        if line == boundaryLine + Data("--".utf8) {
          buffer.removeAll(keepingCapacity: false)
          break parseLoop
        }
        guard line == boundaryLine else {
          buffer.removeFirst()
          continue
        }
        buffer.removeSubrange(buffer.startIndex..<lineEnd.upperBound)
        state = .headers

      case .headers:
        let terminator = Data("\r\n\r\n".utf8)
        guard let headerEnd = buffer.range(of: terminator) else {
          if buffer.count > Self.maximumHeaderBytes {
            throw MJPEGStreamParserError.headerTooLarge
          }
          break parseLoop
        }
        guard headerEnd.lowerBound <= Self.maximumHeaderBytes else {
          throw MJPEGStreamParserError.headerTooLarge
        }
        let headerData = buffer[buffer.startIndex..<headerEnd.lowerBound]
        let contentLength = try parseContentLength(headerData)
        buffer.removeSubrange(buffer.startIndex..<headerEnd.upperBound)
        state = .body(contentLength: contentLength)

      case let .body(contentLength):
        if let contentLength {
          guard contentLength <= Self.maximumFrameBytes else {
            throw MJPEGStreamParserError.frameTooLarge
          }
          guard buffer.count >= contentLength else {
            break parseLoop
          }
          let frame = Data(buffer.prefix(contentLength))
          buffer.removeFirst(contentLength)
          if buffer.starts(with: Data("\r\n".utf8)) {
            buffer.removeFirst(2)
          }
          try validateJPEG(frame)
          try onFrame(frame)
          state = .boundary
        } else {
          guard let delimiterRange = buffer.range(of: bodyDelimiter) else {
            if buffer.count > Self.maximumFrameBytes + bodyDelimiter.count {
              throw MJPEGStreamParserError.frameTooLarge
            }
            break parseLoop
          }
          let frame = Data(buffer[buffer.startIndex..<delimiterRange.lowerBound])
          guard frame.count <= Self.maximumFrameBytes else {
            throw MJPEGStreamParserError.frameTooLarge
          }
          try validateJPEG(frame)
          try onFrame(frame)
          buffer.removeSubrange(buffer.startIndex..<delimiterRange.lowerBound)
          state = .boundary
        }
      }
    }
  }

  private func parseContentLength(_ data: Data.SubSequence) throws -> Int? {
    guard let headers = String(data: data, encoding: .isoLatin1) else {
      throw MJPEGStreamParserError.jpegInvalid
    }
    for line in headers.components(separatedBy: "\r\n") {
      let components = line.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
      guard components.count == 2,
            components[0].trimmingCharacters(in: .whitespacesAndNewlines)
              .caseInsensitiveCompare("Content-Length") == .orderedSame else {
        continue
      }
      guard let length = Int(components[1].trimmingCharacters(in: .whitespacesAndNewlines)),
            length >= 0 else {
        throw MJPEGStreamParserError.jpegInvalid
      }
      return length
    }
    return nil
  }

  private func validateJPEG(_ data: Data) throws {
    guard data.count >= 4,
          data[data.startIndex] == 0xff,
          data[data.index(after: data.startIndex)] == 0xd8,
          data[data.index(data.endIndex, offsetBy: -2)] == 0xff,
          data[data.index(before: data.endIndex)] == 0xd9 else {
      throw MJPEGStreamParserError.jpegInvalid
    }
  }
}
