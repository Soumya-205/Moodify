import os
import json
import requests
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from dotenv import load_dotenv


load_dotenv()

# ── Mood profiles ────────────────────────────────────────────────────────────
mood_profiles = {
    'happy':     {'valence': 0.8, 'energy': 0.7, 'danceability': 0.7, 'tempo': 120},
    'sad':       {'valence': 0.2, 'energy': 0.3, 'danceability': 0.3, 'tempo': 70},
    'energetic': {'valence': 0.7, 'energy': 0.9, 'danceability': 0.8, 'tempo': 140},
    'chill':     {'valence': 0.5, 'energy': 0.3, 'danceability': 0.4, 'tempo': 90},
    'romantic':  {'valence': 0.6, 'energy': 0.4, 'danceability': 0.5, 'tempo': 100},
}

mood_genres = {
    'happy':     ['Comedy', 'Animation', 'Family'],
    'sad':       ['Drama', 'Romance'],
    'energetic': ['Action', 'Thriller', 'Adventure'],
    'chill':     ['Documentary', 'Music', 'Fantasy'],
    'romantic':  ['Romance', 'Drama', 'Comedy'],
}

VALID_MOODS = list(mood_profiles.keys())


# ── kaggle file────────────────────────────────────
def load_spotify_playlist():
    """
    Loads songs from local CSV instead of Spotify API.
    """

    tracks = pd.read_csv(
        r"C:\Users\5soum\OneDrive\Desktop\Moodify\data\tracks_english.csv"
    )

    tracks = tracks[
        [
            'track_name',
            'artists',
            'track_genre',
            'valence',
            'energy',
            'danceability',
            'tempo'
        ]
    ].dropna()

    print(f"[CSV] Loaded {len(tracks)} tracks")

    return tracks

# ── Scale track features ─────────────────────────────────────────────────────
def prepare_tracks(tracks: pd.DataFrame):
    scaler = MinMaxScaler()
    features = tracks[['valence', 'energy', 'danceability', 'tempo']].copy()
    scaled = scaler.fit_transform(features)
    return scaler, scaled


# ── Song recommender ─────────────────────────────────────────────────────────
def recommend_songs(mood: str, tracks: pd.DataFrame,
                    scaler: MinMaxScaler,
                    track_features_scaled: np.ndarray,
                    n: int = 5) -> pd.DataFrame:
    mood_vector = pd.DataFrame([mood_profiles[mood]])
    mood_vector_scaled = scaler.transform(mood_vector)

    similarities = cosine_similarity(mood_vector_scaled, track_features_scaled)
    top_indices = similarities[0].argsort()[-50:][::-1]

    results = tracks.iloc[top_indices][['track_name', 'artists', 'track_genre']].copy()
    results['similarity'] = similarities[0][top_indices]
    results = results.drop_duplicates(subset='track_name')
    results = results.drop_duplicates(subset='artists')

    return results.head(n).reset_index(drop=True)


# ── Movie recommender ─────────────────────────────────────────────────────────
def load_movies(path: str = 'data/tmdb_5000_movies.csv') -> pd.DataFrame:
    movies = pd.read_csv(path)
    movies['genre_list'] = movies['genres'].apply(_extract_genres)
    return movies[['title', 'genres', 'genre_list', 'vote_average', 'vote_count', 'overview']]


def _extract_genres(genre_str: str) -> list:
    try:
        return [g['name'] for g in json.loads(genre_str)]
    except Exception:
        return []

def fetch_poster(title: str) -> str:
    """Fetches movie poster URL from TMDB API by title."""
    api_key = os.getenv("TMDB_API_KEY")
    try:
        search_url = f"https://api.themoviedb.org/3/search/movie"
        params = {"api_key": api_key, "query": title}
        resp = requests.get(search_url, params=params, timeout=5)
        data = resp.json()
        results = data.get("results", [])
        if results and results[0].get("poster_path"):
            return f"https://image.tmdb.org/t/p/w200{results[0]['poster_path']}"
    except Exception:
        pass
    return ""

def recommend_movies(mood: str, movies: pd.DataFrame, n: int = 5) -> pd.DataFrame:
    target_genres = mood_genres[mood]

    matching = movies[
        movies['genre_list'].apply(lambda gl: any(g in target_genres for g in gl)) &
        (movies['vote_average'] >= 7.0) &
        (movies['vote_count'] >= 500)
    ].copy()

    matching = matching.sort_values('vote_average', ascending=False)
    result = matching[['title', 'genre_list', 'vote_average']].head(n).reset_index(drop=True)
    
    # Fetch poster for each movie
    result['poster'] = result['title'].apply(fetch_poster)
    
    return result


# ── LLaMA3 via Ollama — mood extraction ──────────────────────────────────────
def extract_mood_ollama(user_text: str) -> dict:
    """
    Sends the user's free-text message to LLaMA3 running locally via Ollama.
    Returns a dict like: {"mood": "sad", "reason": "user said feeling low"}
    """
    system_prompt = f"""You are a mood detection assistant.
Extract the mood from the user's message and return ONLY valid JSON.
No explanation, no markdown, no extra text — just raw JSON.

JSON format:
{{"mood": "<one of: happy, sad, energetic, chill, romantic>", "reason": "<short reason>"}}

Valid moods: {', '.join(VALID_MOODS)}
If unsure, default to "chill".
"""

    payload = {
        "model": "llama3",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_text}
        ],
        "stream": False
    }

    try:
        resp = requests.post(
            "http://localhost:11434/api/chat",
            json=payload,
            timeout=120
        )
        resp.raise_for_status()
        raw = resp.json()["message"]["content"].strip()

        # Strip any accidental markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        parsed = json.loads(raw)

        # Validate mood falls in our set
        if parsed.get("mood") not in VALID_MOODS:
            parsed["mood"] = "chill"

        return parsed

    except requests.exceptions.ConnectionError:
        raise RuntimeError(
            "Cannot reach Ollama. Make sure it is running: `ollama serve`"
        )
    except json.JSONDecodeError:
        # Fallback: scan the raw string for a known mood keyword
        for mood in VALID_MOODS:
            if mood in raw.lower():
                return {"mood": mood, "reason": "fallback keyword match"}
        return {"mood": "chill", "reason": "could not parse LLaMA3 response"}


# ── LLaMA3 via Ollama — conversational reply ─────────────────────────────────
def generate_reply_ollama(user_text: str, mood: str,
                           songs: pd.DataFrame,
                           movies: pd.DataFrame) -> str:
    """
    Asks LLaMA3 to write a warm, personalised 2-3 sentence reply
    introducing the recommendations.
    """
    song_list  = "\n".join(
        f"  - {r['track_name']} by {r['artists']}"
        for _, r in songs.iterrows()
    )
    movie_list = "\n".join(
        f"  - {r['title']} (rated {r['vote_average']})"
        for _, r in movies.iterrows()
    )

    prompt = f"""The user said: "{user_text}"
Detected mood: {mood}

Songs from the playlist (matched to mood):
{song_list}

Movie recommendations:
{movie_list}

Write a warm, friendly 2-3 sentence response introducing these picks.
Do NOT list them again — just write a natural intro.
"""

    payload = {
        "model": "llama3",
        "messages": [
            {"role": "system", "content": "You are Moodify, a warm and empathetic music and film companion."},
            {"role": "user",   "content": prompt}
        ],
        "stream": False
    }

    try:
        resp = requests.post(
            "http://localhost:11434/api/chat",
            json=payload,
            timeout=30
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"].strip()

    except Exception as e:
        return f"Here are your {mood} mood picks — hope you enjoy them! 🎵🎬"
