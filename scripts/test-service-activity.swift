import Foundation

@main
struct ServiceActivityTest {
    static func main() {
        let historicalState = Data(#"{"workspaces":[{"nodes":[{"status":"completed","response":"\ud83d"}]}]}"#.utf8)
        precondition((try? JSONSerialization.jsonObject(with: historicalState)) == nil,
                     "Fixture must reproduce the old full-history parsing failure")
        let base = URL(string: CommandLine.arguments[1])!
        let expected = Int(CommandLine.arguments[2])
        var finished = false
        ServiceActivity.read(from: base) { count in
            precondition(Thread.isMainThread)
            precondition(count == expected, "Expected \(String(describing: expected)), got \(String(describing: count))")
            finished = true
        }
        let deadline = Date().addingTimeInterval(5)
        while !finished && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.01))
        }
        precondition(finished, "Activity request did not complete")
    }
}
