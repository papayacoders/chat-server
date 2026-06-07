
const socket = io(`${window.location.protocol}//${window.location.host}`);

console.log(socket);

const form = document.getElementById('send-container');
const messageInput = document.getElementById('messageInp');
const messageContainer = document.getElementById("chatbox");
const username = document.getElementById("user");
const userRoomId = document.getElementById("roomId");

const messageTextarea = document.getElementById('messageInp');

// Initialize Emoji Picker Safely
let picker;
try {
    if (typeof EmojiButton !== 'undefined') {
        picker = new EmojiButton({
            position: 'top-start',
            theme: document.documentElement.getAttribute('data-theme') || 'dark'
        });
        const emojiBtn = document.getElementById('emoji-btn');

        picker.on('emoji', selection => {
            messageTextarea.value += selection.emoji;
            adjustHeight();
        });

        emojiBtn.addEventListener('click', () => {
            picker.togglePicker(emojiBtn);
        });
    }
} catch (err) {
    console.error("Emoji Picker failed to initialize:", err);
}

const adjustHeight = () => {
    messageTextarea.style.height = '34px'; // Reset height to auto
    const newHeight = Math.min(messageTextarea.scrollHeight, 150); // Set new height based on content
    messageTextarea.style.height = `${newHeight}px`; // Apply the calculated height
};

messageTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { // Check if Enter is pressed and Shift is not held
        e.preventDefault(); // Prevent default action (new line)
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); // Trigger form submission
    }
});

let typingTimeout;

// Add event listener for input events
messageTextarea.addEventListener('input', () => {
    adjustHeight();
    socket.emit('typing', name);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop-typing', name);
    }, 1000);
});
adjustHeight();

// Sidebar elements
const soundNotificationCheckbox = document.getElementById('soundNotification');
const screenNotificationCheckbox = document.getElementById('screenNotification');
const joinLeaveNotificationCheckbox = document.getElementById('joinLeaveNotification');

// Load saved notification preferences from localStorage
const loadPreferences = () => {
    soundNotificationCheckbox.checked = JSON.parse(localStorage.getItem('soundNotification') || 'true');
    screenNotificationCheckbox.checked = JSON.parse(localStorage.getItem('screenNotification') || 'true');
    joinLeaveNotificationCheckbox.checked = JSON.parse(localStorage.getItem('joinLeaveNotification') || 'true');
};

// Save notification preferences to localStorage
const savePreferences = () => {
    localStorage.setItem('soundNotification', JSON.stringify(soundNotificationCheckbox.checked));
    localStorage.setItem('screenNotification', JSON.stringify(screenNotificationCheckbox.checked));
    localStorage.setItem('joinLeaveNotification', JSON.stringify(joinLeaveNotificationCheckbox.checked));
};

var audio = new Audio('pop.mp3');

// Function to append messages
const append = (message, position, isHtml = false) => {
    if (!messageContainer) return;
    const messageElement = document.createElement('div');
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let contentHtml = isHtml ? message : `<span style="white-space: pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`;
    messageElement.innerHTML = `${contentHtml} <div class="timestamp">${timeString}</div>`;

    messageElement.classList.add('message', 'text-wrap', position);
    messageContainer.append(messageElement);
    scrollToBottom();

    if (position === 'left' && soundNotificationCheckbox.checked) {
        audio.play().catch(e => console.log('Audio play prevented', e));
    }

    if (position === 'left' && screenNotificationCheckbox.checked) {
        document.title = "New Message!";
        setTimeout(() => { document.title = "ChatBox"; }, 2000);
    }
};

// Event listener for form submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageTextarea.value.trim();

    if (message === '') return;

    append(`<span style="color: purple; font-weight: bold;">You</span>: ${message}`, 'right', true);
    socket.emit('send', message);
    messageTextarea.value = '';
    adjustHeight();
});


// Prompt user for their name and join room with validation
let name = '';

while (!name) {
    name = prompt("Enter your name to join").trim();
    if (!name) {
        alert("Name cannot be blank. Please enter your name.");
    }
}

let roomId = 'Global';
const params = new URLSearchParams(window.location.search);
params.forEach((value, key) => {
    roomId = key;
});
socket.emit('join-room', roomId, name);

sessionStorage.setItem("name", name);
sessionStorage.setItem("roomId", roomId);

const sessionData = sessionStorage.getItem("name");
username.innerText = sessionData;
const sessionDatau = sessionStorage.getItem("roomId");
userRoomId.innerText = `(Room ID-${sessionDatau})`;

// Socket event listeners
socket.on('user-joined', (name) => {
    const joinMessage = `<span style="color: green; font-weight: bold;">*${name} joined the chat </span>`;
    append(joinMessage, 'left', true);
    if (joinLeaveNotificationCheckbox.checked) {
        alert(`${name} has joined the chat.`);
    }
    scrollToBottom();
});

socket.on('receive', (data) => {
    const formattedMessage = `<span style="color: skyblue; font-weight: bold;">${data.name}</span>: ${data.message}`;
    
    // Remove typing indicator if exists before appending message
    const typingEl = document.getElementById(`typing-${data.name}`);
    if (typingEl) typingEl.remove();

    append(formattedMessage, 'left', true);
    scrollToBottom();
});

socket.on('typing', (data) => {
    let typingEl = document.getElementById(`typing-${data.name}`);
    if (!typingEl && messageContainer) {
        typingEl = document.createElement('div');
        typingEl.id = `typing-${data.name}`;
        typingEl.classList.add('message', 'left', 'typing-indicator-msg');
        typingEl.innerHTML = `<span class="typing-name" style="color: #0dcaf0; font-weight: bold; font-size: 0.8rem; display: block; margin-bottom: 2px;">${data.name} is typing</span>
                              <div class="typing-loader"><span></span><span></span><span></span></div>`;
        messageContainer.append(typingEl);
        scrollToBottom();
    }
});

socket.on('stop-typing', (data) => {
    const typingEl = document.getElementById(`typing-${data.name}`);
    if (typingEl) typingEl.remove();
});

socket.on('left', (name) => {
    const leftMessage = `<span style="color: green; font-weight: bold;">${name} left the chat </span>`;
    
    const typingEl = document.getElementById(`typing-${name}`);
    if (typingEl) typingEl.remove();

    append(leftMessage, 'left', true);
    if (joinLeaveNotificationCheckbox.checked) {
        alert(`${name} has left the chat.`);
    }
    scrollToBottom();
});

function scrollToBottom() {
    if (messageContainer) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }
}

// Load preferences when page loads
loadPreferences();

// Save preferences when any checkbox is toggled
soundNotificationCheckbox.addEventListener('change', savePreferences);
screenNotificationCheckbox.addEventListener('change', savePreferences);
joinLeaveNotificationCheckbox.addEventListener('change', savePreferences);
