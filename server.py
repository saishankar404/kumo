from flask import Flask, request, jsonify
import time

app = Flask(__name__)


@app.route("/search", methods=["GET"])
def search():
    query = request.args.get("query", "")
    start_time = time.time()

    # Simulate searching (e.g., fetching 55 quantum computing papers)
    results = [{"id": i, "title": f"Quantum Computing Paper {i}"} for i in range(1, 56)]

    # Calculate fetch duration
    fetch_time = time.time() - start_time

    response = {"query": query, "results": results, "fetch_time": fetch_time}
    return jsonify(response)


if __name__ == "__main__":
    app.run(debug=True)
