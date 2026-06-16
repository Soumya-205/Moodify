from flask_cors import CORS
from flask import Flask, request, jsonify, render_template

from recommender import (
    load_spotify_playlist,
    load_movies,
    prepare_tracks,
    recommend_songs,
    recommend_movies,
    extract_mood_ollama,
    generate_reply_ollama,
    VALID_MOODS,
)

app = Flask(__name__)
CORS(app)

# ── Load data once at startup ─────────────────────────────────────────────────
print("Loading your Spotify playlist...")
tracks = load_spotify_playlist()
scaler, track_features_scaled = prepare_tracks(tracks)

print("Loading movies...")
movies = load_movies('data/tmdb_5000_movies.csv')

print("Moodify is ready!")

@app.route('/')
def home():
    return render_template('index.html')


# ── Health check ──────────────────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'tracks_loaded': len(tracks),
        'movies_loaded': len(movies),
    })


# ── Conversational endpoint (LLaMA3 → mood → recommendations → reply) ────────
@app.route('/chat', methods=['POST'])
def chat():
    """
    Body: { "message": "I'm feeling low today, want something chill" }

    Returns:
    {
        "reply":  "Here's what I picked for you...",
        "mood":   "sad",
        "reason": "user said feeling low",
        "songs":  [...],
        "movies": [...]
    }
    """
    data = request.get_json(silent=True)
    if not data or not data.get('message', '').strip():
        return jsonify({'error': 'Please send a message.'}), 400

    user_text = data['message'].strip()

    # Step 1: LLaMA3 extracts mood
    try:
        parsed = extract_mood_ollama(user_text)
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503

    mood   = parsed['mood']
    reason = parsed.get('reason', '')

    # Step 2: Get recommendations
    songs  = recommend_songs(mood, tracks, scaler, track_features_scaled, n=5)
    movies_result = recommend_movies(mood, movies, n=5)

    # Step 3: LLaMA3 writes a warm reply
    reply = generate_reply_ollama(user_text, mood, songs, movies_result)

    return jsonify({
        'reply':  reply,
        'mood':   mood,
        'reason': reason,
        'songs':  songs.to_dict('records'),
        'movies': movies_result.to_dict('records'),
    })


# ── Direct mood endpoint (no LLaMA3 — for the old button-based frontend) ─────
@app.route('/recommend', methods=['POST'])
def recommend():
    """
    Body: { "mood": "happy", "n": 5 }

    Returns: { "songs": [...], "movies": [...] }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'JSON body required.'}), 400

    mood = data.get('mood', '').lower().strip()
    if mood not in VALID_MOODS:
        return jsonify({
            'error': f"Invalid mood. Choose from: {', '.join(VALID_MOODS)}"
        }), 400

    n = min(int(data.get('n', 5)), 20)   # cap at 20

    songs         = recommend_songs(mood, tracks, scaler, track_features_scaled, n=n)
    movies_result = recommend_movies(mood, movies, n=n)

    return jsonify({
        'mood':   mood,
        'songs':  songs.to_dict('records'),
        'movies': movies_result.to_dict('records'),
    })


# ── List valid moods ──────────────────────────────────────────────────────────
@app.route('/moods', methods=['GET'])
def moods():
    return jsonify({'moods': VALID_MOODS})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
