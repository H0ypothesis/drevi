import Foundation

enum ServiceActivity {
    private struct Activity: Decodable {
        let activeNodeCount: Int
    }

    static func read(from base: URL, completion: @escaping (Int?) -> Void) {
        // Only request the count: history may contain truncated surrogate pairs
        // that JavaScript accepts but Foundation's JSON parser rejects.
        var request = URLRequest(url: base.appendingPathComponent("api/activity"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 3
        URLSession.shared.dataTask(with: request) { data, response, error in
            guard error == nil, let response = response as? HTTPURLResponse,
                  response.statusCode == 200,
                  response.url?.scheme == base.scheme, response.url?.host == base.host,
                  response.url?.port == base.port, let data = data,
                  let activity = try? JSONDecoder().decode(Activity.self, from: data),
                  activity.activeNodeCount >= 0 else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            DispatchQueue.main.async { completion(activity.activeNodeCount) }
        }.resume()
    }
}
