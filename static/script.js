// ── Element refs ────────────────────────────────────────────────────────
const sendBtn   = document.getElementById("sendBtn");
const input      = document.getElementById("userInput");
const chatArea   = document.getElementById("chatArea");
const songsTab   = document.getElementById("songsTab");
const moviesTab  = document.getElementById("moviesTab");
const songsList  = document.getElementById("songsList");
const moviesList = document.getElementById("moviesList");
const moodPills  = document.querySelectorAll(".mood-pill");
const eqEl       = document.querySelector(".eq");

// Mirrors the tempo values in recommender.py's mood_profiles, just so the
// header equalizer "feels" like the mood it's reflecting.
const MOOD_TEMPO = {
    happy: 120,
    sad: 70,
    energetic: 140,
    chill: 90,
    romantic: 100,
};

const EMPTY_SONGS_HTML = `
    <div class="empty-state">
        <span class="empty-icon">♪</span>
        <p>No songs yet</p>
        <span>Tell me your mood, or pick one above to get started.</span>
    </div>`;

const EMPTY_MOVIES_HTML = `
    <div class="empty-state">
        <span class="empty-icon">🎬</span>
        <p>No movies yet</p>
        <span>Tell me your mood, or pick one above to get started.</span>
    </div>`;

// ── Mood-reactive theming ───────────────────────────────────────────────
function setMood(mood) {
    if (!MOOD_TEMPO.hasOwnProperty(mood)) return;

    document.body.dataset.mood = mood;

    moodPills.forEach(pill => {
        const isActive = pill.dataset.mood === mood;
        pill.classList.toggle("active", isActive);
        pill.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    const tempo = MOOD_TEMPO[mood];
    const duration = (60 / tempo) * 1.8; // slower tempo -> slower bounce
    if (eqEl) eqEl.style.setProperty("--eq-dur", `${duration.toFixed(2)}s`);
}

// ── Chat helpers ────────────────────────────────────────────────────────
function appendMessage(role, text, tagText) {
    const message = document.createElement("div");
    message.className = `message ${role}`;

    if (role === "bot") {
        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = "🎧";
        message.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const p = document.createElement("p");
    p.textContent = text;
    bubble.appendChild(p);

    if (tagText) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = tagText;
        bubble.appendChild(tag);
    }

    message.appendChild(bubble);
    chatArea.appendChild(message);
    chatArea.scrollTop = chatArea.scrollHeight;
    return message;
}

function showTyping() {
    const message = document.createElement("div");
    message.className = "message bot typing";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "🎧";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;

    message.appendChild(avatar);
    message.appendChild(bubble);
    chatArea.appendChild(message);
    chatArea.scrollTop = chatArea.scrollHeight;
    return message;
}

function setSending(isSending) {
    sendBtn.disabled = isSending;
    input.disabled = isSending;
}

// ── Send a free-text message → /chat ────────────────────────────────────
async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    appendMessage("user", text);
    input.value = "";
    setSending(true);

    const typingMsg = showTyping();

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
        });

        if (!response.ok) throw new Error("Server error");

        const data = await response.json();
        typingMsg.remove();

        appendMessage("bot", data.reply, `mood: ${data.mood}`);
        setMood(data.mood);
        updateSongs(data.songs);
        updateMovies(data.movies);

    } catch (error) {
        typingMsg.remove();
        console.error(error);
        appendMessage("bot", "Unable to connect to Moodify backend.");
    } finally {
        setSending(false);
        input.focus();
    }
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});

// ── Mood pills → /recommend (no LLaMA round trip needed) ────────────────
async function selectMood(mood) {
    setMood(mood);
    setSending(true);

    try {
        const response = await fetch("/recommend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mood, n: 5 }),
        });

        if (!response.ok) throw new Error("Server error");

        const data = await response.json();
        appendMessage("bot", `Switched to ${mood} mode — here's what matches.`, `mood: ${mood}`);
        updateSongs(data.songs);
        updateMovies(data.movies);

    } catch (error) {
        console.error(error);
        appendMessage("bot", "Unable to connect to Moodify backend.");
    } finally {
        setSending(false);
    }
}

moodPills.forEach(pill => {
    pill.addEventListener("click", () => selectMood(pill.dataset.mood));
});

// ── Render songs ─────────────────────────────────────────────────────────
function updateSongs(songs) {
    songsList.innerHTML = "";

    if (!songs || songs.length === 0) {
        songsList.innerHTML = EMPTY_SONGS_HTML;
        return;
    }

    songs.forEach(song => {
        const card = document.createElement("div");
        card.className = "song-card";

        const icon = document.createElement("div");
        icon.className = "song-icon";
        icon.textContent = "♪";

        const info = document.createElement("div");
        info.className = "song-info";

        const title = document.createElement("h3");
        title.textContent = song.track_name || "Untitled";

        const artist = document.createElement("p");
        artist.textContent = song.artists || "Unknown artist";

        info.appendChild(title);
        info.appendChild(artist);

        card.appendChild(icon);
        card.appendChild(info);

        if (song.track_genre) {
            const genre = document.createElement("span");
            genre.className = "genre-chip";
            genre.textContent = song.track_genre;
            card.appendChild(genre);
        }

        songsList.appendChild(card);
    });
}

// ── Render movies ───────────────────────────────────────────────────────
function updateMovies(movies) {
    moviesList.innerHTML = "";

    if (!movies || movies.length === 0) {
        moviesList.innerHTML = EMPTY_MOVIES_HTML;
        return;
    }

    movies.forEach(movie => {
        const card = document.createElement("div");
        card.className = "movie-card";

        // Poster
        const poster = document.createElement("div");
        poster.className = "movie-poster";
        if (movie.poster) {
            const img = document.createElement("img");
            img.src = movie.poster;
            img.alt = movie.title;
            img.loading = "lazy";
            poster.appendChild(img);
        } else {
            poster.textContent = "🎬";
        }

        // Info
        const info = document.createElement("div");
        info.className = "movie-info";

        const title = document.createElement("h3");
        title.textContent = movie.title || "Untitled";

        const meta = document.createElement("div");
        meta.className = "movie-meta";

        const rating = document.createElement("span");
        rating.className = "rating-chip";
        const score = typeof movie.vote_average === "number"
            ? movie.vote_average.toFixed(1)
            : movie.vote_average;
        rating.textContent = `⭐ ${score}`;
        meta.appendChild(rating);

        const genres = Array.isArray(movie.genre_list) ? movie.genre_list : [];
        genres.slice(0, 3).forEach(g => {
            const chip = document.createElement("span");
            chip.className = "genre-chip";
            chip.textContent = g;
            meta.appendChild(chip);
        });

        info.appendChild(title);
        info.appendChild(meta);

        card.appendChild(poster);
        card.appendChild(info);
        moviesList.appendChild(card);
    });
}
// ── Tabs ─────────────────────────────────────────────────────────────────
songsTab.addEventListener("click", () => {
    songsList.style.display = "flex";
    moviesList.style.display = "none";

    songsTab.classList.add("active-tab");
    moviesTab.classList.remove("active-tab");
    songsTab.setAttribute("aria-selected", "true");
    moviesTab.setAttribute("aria-selected", "false");
});

moviesTab.addEventListener("click", () => {
    songsList.style.display = "none";
    moviesList.style.display = "flex";

    moviesTab.classList.add("active-tab");
    songsTab.classList.remove("active-tab");
    moviesTab.setAttribute("aria-selected", "true");
    songsTab.setAttribute("aria-selected", "false");
});

// ── Init ─────────────────────────────────────────────────────────────────
setMood(document.body.dataset.mood || "romantic");