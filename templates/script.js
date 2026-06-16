const sendBtn = document.getElementById("sendBtn");
const input = document.querySelector(".input-box input");
const chatArea = document.querySelector(".chat-area");

sendBtn.addEventListener("click", async () => {
    const message = input.value.trim();

    if (!message) return;

    // User message
    const userMsg = document.createElement("div");
    userMsg.className = "message user";
    userMsg.textContent = message;
    chatArea.appendChild(userMsg);
    chatArea.scrollTop = chatArea.scrollHeight;

    input.value = "";

    // Loading message
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "message bot loading";
    loadingMsg.textContent = "Thinking... 🎵";
    chatArea.appendChild(loadingMsg);

    

    try {
        const response = await fetch("http://127.0.0.1:5000/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: message
            })
        });

        if (!response.ok) {
            throw new Error("Server error");
        }

        const data = await response.json();
        loadingMsg.remove();
        // Bot reply
        const botMsg = document.createElement("div");
        botMsg.className = "message bot";

        botMsg.innerHTML = `
            <p>${data.reply}</p>
            <span class="tag">mood: ${data.mood}</span>
        `;

        chatArea.appendChild(botMsg);
        chatArea.scrollTop = chatArea.scrollHeight;

        // Update songs
        updateSongs(data.songs);

        // Update movies
        updateMovies(data.movies);

        chatArea.scrollTop = chatArea.scrollHeight;

    } catch (error) {
        loadingMsg.remove();
        console.error(error);

        const errorMsg = document.createElement("div");
        errorMsg.className = "message bot";
        errorMsg.textContent = "Unable to connect to Moodify backend.";
        chatArea.appendChild(errorMsg);
    }
});

function updateSongs(songs) {
    const container = document.querySelector(".songs");

    if (!songs || songs.length === 0) {
        container.innerHTML = "<p>No songs found.</p>";
        return;
    }


    container.innerHTML = "";

    songs.forEach(song => {
        container.innerHTML += `
            <div class="song-card">
                <div>
                    <h3>${song.track_name}</h3>
                    <p>${song.artists}</p>
                </div>
            </div>
        `;
    });
}

function updateMovies(movies) {
    const container = document.querySelector(".movies");

    if (!container) return;

    if (!movies || movies.length === 0) {
        container.innerHTML = "<p>No movies found.</p>";
        return;
    }


    container.innerHTML = "";

    movies.forEach(movie => {
        container.innerHTML += `
            <div class="song-card">
                <div>
                    <h3>${movie.title}</h3>
                    <p>⭐ ${movie.vote_average}</p>
                </div>
            </div>
        `;
    });
}

const songsTab = document.getElementById("songsTab");
const moviesTab = document.getElementById("moviesTab");

songsTab.addEventListener("click", () => {
    document.querySelector(".songs").style.display = "flex";
    document.querySelector(".movies").style.display = "none";

    songsTab.classList.add("active-tab");
    moviesTab.classList.remove("active-tab");
});

moviesTab.addEventListener("click", () => {
    document.querySelector(".songs").style.display = "none";
    document.querySelector(".movies").style.display = "flex";

    moviesTab.classList.add("active-tab");
    songsTab.classList.remove("active-tab");
});

input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendBtn.click();
    }
});