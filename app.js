// app.js - Main Chat Logic (Firebase Compat style)

let currentUser = null;
let currentChatId = null;
let messagesListener = null;

const contactList = document.getElementById('contact-list');
const sidebar = document.getElementById('sidebar');
const chatArea = document.getElementById('chat-area');
const noChatSelected = document.getElementById('no-chat-selected');
const activeChat = document.getElementById('active-chat');
const chatName = document.getElementById('chat-name');
const chatAvatar = document.getElementById('chat-avatar');
const chatMessages = document.getElementById('chat-messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const backBtn = document.getElementById('back-btn');
const logoutBtn = document.getElementById('logout-btn');
const myProfileAvatar = document.getElementById('my-profile-avatar');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const sidebarMyName = document.getElementById('sidebar-my-name');
const sidebarMyUsername = document.getElementById('sidebar-my-username');

// --- Profile Modal Elements ---
const profileModal = document.getElementById('profile-modal');
const editProfileBtn = document.getElementById('edit-profile-btn');
const closeProfileModal = document.getElementById('close-profile-modal');
const saveProfileBtn = document.getElementById('save-profile-btn');
const profileNameInput = document.getElementById('profile-name-input');
const profileUsernameInput = document.getElementById('profile-username-input');
const profileError = document.getElementById('profile-error');
const modalAvatar = document.getElementById('modal-avatar');

// Logout
logoutBtn.addEventListener('click', () => auth.signOut());

// Guard: redirect to login if not logged in
auth.onAuthStateChanged(async (user) => {
    console.log('Auth state:', user ? user.email : 'not logged in');
    if (!user) {
        window.location.href = 'login.html';
    } else {
        currentUser = user;
        await refreshMyProfile();
        loadContacts();
    }
});

// Fetch & display the current user's name/username in sidebar
async function refreshMyProfile() {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        const name = data.name || currentUser.email.split('@')[0];
        const username = data.username || '';
        sidebarMyName.textContent = name;
        sidebarMyUsername.textContent = username ? '@' + username : data.email || '';
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
        myProfileAvatar.src = avatarUrl;
    }
}

// --- Profile Modal Logic ---
function openProfileModal() {
    db.collection('users').doc(currentUser.uid).get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            profileNameInput.value = data.name || '';
            profileUsernameInput.value = data.username || '';
            const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || currentUser.email)}&background=random`;
            modalAvatar.src = avatarUrl;
        }
        profileError.textContent = '';
        profileModal.style.display = 'flex';
    });
}

function closeModal() {
    profileModal.style.display = 'none';
}

myProfileAvatar.addEventListener('click', openProfileModal);
editProfileBtn.addEventListener('click', openProfileModal);
closeProfileModal.addEventListener('click', closeModal);
profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) closeModal();
});

saveProfileBtn.addEventListener('click', async () => {
    const newName = profileNameInput.value.trim();
    const newUsername = profileUsernameInput.value.trim().toLowerCase();

    profileError.textContent = '';

    if (!newName) {
        profileError.textContent = 'Display name cannot be empty.';
        return;
    }
    if (newUsername && !/^[a-z0-9_]{2,24}$/.test(newUsername)) {
        profileError.textContent = 'Username must be 2–24 chars: letters, numbers, underscores only.';
        return;
    }

    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = 'Saving...';

    try {
        // Check username uniqueness (skip if unchanged)
        if (newUsername) {
            const existing = await db.collection('users')
                .where('username', '==', newUsername).get();
            const takenByOther = existing.docs.some(d => d.id !== currentUser.uid);
            if (takenByOther) {
                profileError.textContent = 'That username is already taken. Try another.';
                return;
            }
        }

        await db.collection('users').doc(currentUser.uid).update({
            name: newName,
            username: newUsername
        });

        await refreshMyProfile();
        closeModal();
    } catch (err) {
        profileError.textContent = 'Error: ' + err.message;
    } finally {
        saveProfileBtn.disabled = false;
        saveProfileBtn.textContent = 'Save Changes';
    }
});

// Load & display contacts from Firestore
function loadContacts() {
    console.log('Loading contacts...');
    db.collection('users').onSnapshot((snapshot) => {
        console.log('Users found:', snapshot.size);
        contactList.innerHTML = '';

        if (snapshot.empty) {
            contactList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">No friends yet. Share your invite code!</div>';
            return;
        }

        snapshot.forEach((doc) => {
            const u = doc.data();
            const label = u.uid === currentUser.uid ? u.name + ' (You)' : u.name;
            const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=random`;

            const el = document.createElement('div');
            el.className = 'contact-item';
            el.innerHTML = `
                <img src="${avatarUrl}" class="contact-avatar" alt="${label}">
                <div class="contact-info">
                    <div class="contact-name-time">
                        <span class="contact-name">${label}</span>
                    </div>
                    <div class="contact-last-msg">Tap to chat</div>
                </div>`;
            el.addEventListener('click', () => openChat(u, avatarUrl));
            contactList.appendChild(el);
        });
    }, (err) => {
        console.error('Firestore error:', err);
        contactList.innerHTML = `<div style="padding:20px;color:red;">Error: ${err.message}</div>`;
    });
}

// Open a chat with a contact
function openChat(contact, avatarUrl) {
    currentChatId = [currentUser.uid, contact.uid].sort().join('_');
    chatName.textContent = contact.name;
    chatAvatar.src = avatarUrl;

    noChatSelected.style.display = 'none';
    activeChat.style.display = 'flex';

    // Mobile: hide sidebar, show chat
    if (window.innerWidth <= 768) {
        sidebar.style.display = 'none';
        chatArea.style.display = 'flex';
        backBtn.style.display = 'block';
    }

    loadMessages();
}

// Mobile back button
backBtn.addEventListener('click', () => {
    sidebar.style.display = 'flex';
    chatArea.style.display = 'none';
    backBtn.style.display = 'none';
    activeChat.style.display = 'none';
    noChatSelected.style.display = 'flex';
});

// Load messages in real-time
function loadMessages() {
    if (messagesListener) messagesListener(); // unsubscribe previous

    chatMessages.innerHTML = '';
    messagesListener = db.collection('chats').doc(currentChatId)
        .collection('messages').orderBy('createdAt', 'asc')
        .onSnapshot((snapshot) => {
            chatMessages.innerHTML = '';
            snapshot.forEach((doc) => {
                const msg = doc.data();
                const isMine = msg.senderId === currentUser.uid;
                const time = msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
                const div = document.createElement('div');
                div.className = `message ${isMine ? 'message-sent' : 'message-received'}`;

                if (msg.type === 'image') {
                    // Image message
                    div.innerHTML = `
                        <img src="${msg.mediaUrl}" alt="Image" class="chat-image"
                             onclick="window.open('${msg.mediaUrl}', '_blank')">
                        <span class="message-time">${time}</span>`;
                } else if (msg.type === 'video') {
                    // Video message
                    div.innerHTML = `
                        <video src="${msg.mediaUrl}" controls class="chat-image"></video>
                        <span class="message-time">${time}</span>`;
                } else {
                    // Text message
                    div.innerHTML = `${msg.text}<span class="message-time">${time}</span>`;
                }

                chatMessages.appendChild(div);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
}

// Send message
async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    if (!currentChatId) {
        alert('Please select a friend to chat with first!');
        return;
    }

    msgInput.value = '';
    msgInput.focus();

    try {
        await db.collection('chats').doc(currentChatId)
            .collection('messages').add({
                text: text,
                senderId: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
    } catch (err) {
        console.error('Failed to send message:', err);
        msgInput.value = text; // restore text if failed
        alert('Failed to send message: ' + err.message);
    }
}

// --- MEDIA UPLOAD ---

// Clicking the paperclip opens the file picker
attachBtn.addEventListener('click', () => fileInput.click());

// When a file is chosen, upload it
fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file || !currentChatId) return;

    // Validate: max 10MB
    if (file.size > 10 * 1024 * 1024) {
        alert('File is too large! Please choose a file under 10MB.');
        return;
    }

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isVideo) {
        alert('Only images and videos are supported!');
        return;
    }

    // Show an uploading indicator
    const uploadDiv = document.createElement('div');
    uploadDiv.className = 'message message-sent';
    uploadDiv.innerHTML = `<span style="color:var(--text-secondary)">⏳ Uploading...</span>`;
    chatMessages.appendChild(uploadDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        // Upload to Firebase Storage
        const filePath = `chats/${currentChatId}/${Date.now()}_${file.name}`;
        const storageRef = storage.ref(filePath);
        const uploadTask = await storageRef.put(file);
        const mediaUrl = await uploadTask.ref.getDownloadURL();

        // Save message to Firestore with the download URL
        await db.collection('chats').doc(currentChatId)
            .collection('messages').add({
                type: isVideo ? 'video' : 'image',
                mediaUrl: mediaUrl,
                senderId: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
    } catch (err) {
        alert('Upload failed: ' + err.message);
    } finally {
        fileInput.value = ''; // Reset the file input
        uploadDiv.remove();  // Remove the uploading indicator
    }
});

// --- SEND TEXT MESSAGE LISTENERS ---
sendBtn.addEventListener('click', sendMessage);

msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// --- SEARCH FRIENDS ---
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const items = contactList.getElementsByClassName('contact-item');
        Array.from(items).forEach(item => {
            const name = item.querySelector('.contact-name')?.textContent?.toLowerCase() || '';
            item.style.display = name.includes(query) ? 'flex' : 'none';
        });
    });
}
