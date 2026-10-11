// app.js - Main Chat Logic (Firebase Compat style)

let currentUser = null;
let currentChatId = null;
let messagesListener = null;
let isSecretRoom = false;
let currentSecretKey = null;
let currentUserName = '';

const contactList = document.getElementById('contact-list');
const sidebar = document.getElementById('sidebar');
const chatArea = document.getElementById('chat-area');
const noChatSelected = document.getElementById('no-chat-selected');
const activeChat = document.getElementById('active-chat');
const chatName = document.getElementById('chat-name');
const chatAvatar = document.getElementById('chat-avatar');
const chatStatus = document.getElementById('chat-status');
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

// --- Secret Room Header Actions ---
const leaveSecretBtn = document.getElementById('leave-secret-btn');
const copySecretKeyBtn = document.getElementById('copy-secret-key-btn');
const clearSecretBtn = document.getElementById('clear-secret-btn');

// --- Secret Room Modal Elements ---
const openSecretModalBtn = document.getElementById('open-secret-modal-btn');
const secretModal = document.getElementById('secret-modal');
const closeSecretModal = document.getElementById('close-secret-modal');
const secretKeyInput = document.getElementById('secret-key-input');
const generateKeyBtn = document.getElementById('generate-key-btn');
const enterSecretRoomBtn = document.getElementById('enter-secret-room-btn');
const secretError = document.getElementById('secret-error');

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
logoutBtn.addEventListener('click', async () => {
    if (currentUser) {
        try {
            await db.collection('users').doc(currentUser.uid).update({
                isOnline: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (_) {}
    }
    auth.signOut();
});

// Presence tracking
function setupPresence() {
    if (!currentUser) return;
    const userRef = db.collection('users').doc(currentUser.uid);

    const markOnline = () => {
        userRef.update({
            isOnline: true,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
    };

    const markOffline = () => {
        userRef.update({
            isOnline: false,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
    };

    markOnline();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            markOnline();
        } else {
            markOffline();
        }
    });

    window.addEventListener('beforeunload', () => {
        markOffline();
    });

    setInterval(() => {
        if (document.visibilityState === 'visible' && currentUser) {
            markOnline();
        }
    }, 45000);
}

// Guard: redirect to login if not logged in
auth.onAuthStateChanged(async (user) => {
    console.log('Auth state:', user ? user.email : 'not logged in');
    if (!user) {
        window.location.href = 'login.html';
    } else {
        currentUser = user;
        setupPresence();
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
        currentUserName = name;
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

let contactsLastMsgListeners = [];
let activeContactListener = null;
let activeTypingListener = null;
let isPartnerTyping = false;
let currentActiveContact = null;
let myTypingTimeout = null;

// Helper to broadcast current user typing status
function setMyTyping(isTyping) {
    if (!currentChatId || !currentUser) return;
    const docRef = isSecretRoom
        ? db.collection('secret_rooms').doc(currentChatId)
        : db.collection('chats').doc(currentChatId);

    docRef.set({
        typing: {
            [currentUser.uid]: isTyping
        }
    }, { merge: true }).catch(() => {});
}

// Render partner online / last seen status in chat header
function renderContactOnlineStatus(data) {
    if (!chatStatus || isPartnerTyping || isSecretRoom) return;
    if (data && data.isOnline) {
        chatStatus.innerHTML = '<span style="color:#25d366;font-weight:500;">Online</span>';
    } else if (data && data.lastSeen) {
        const date = data.lastSeen.toDate ? data.lastSeen.toDate() : new Date(data.lastSeen);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        chatStatus.innerHTML = `<span style="color:var(--text-secondary);">Last seen ${timeStr}</span>`;
    } else {
        chatStatus.innerHTML = '<span style="color:var(--text-secondary);">Offline</span>';
    }
}

// Listen for partner typing in real-time
function listenToTyping(partnerUid) {
    if (activeTypingListener) activeTypingListener();

    const docRef = isSecretRoom
        ? db.collection('secret_rooms').doc(currentChatId)
        : db.collection('chats').doc(currentChatId);

    activeTypingListener = docRef.onSnapshot((doc) => {
        if (!doc.exists) {
            isPartnerTyping = false;
            hideTypingBubble();
            return;
        }

        const typingData = doc.data()?.typing || {};
        let typingNow = false;

        if (isSecretRoom) {
            typingNow = Object.entries(typingData).some(([uid, val]) => uid !== currentUser.uid && val === true);
        } else if (partnerUid) {
            typingNow = typingData[partnerUid] === true;
        }

        isPartnerTyping = typingNow;

        if (typingNow) {
            if (chatStatus) {
                chatStatus.innerHTML = '<span class="typing-status">typing...</span>';
            }
            showTypingBubble();
        } else {
            hideTypingBubble();
            if (isSecretRoom) {
                if (chatStatus) chatStatus.textContent = `🔒 Key: ${currentSecretKey}`;
            } else if (currentActiveContact) {
                renderContactOnlineStatus(currentActiveContact);
            }
        }
    }, () => {});
}

function showTypingBubble() {
    let bubble = document.getElementById('typing-bubble');
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'typing-bubble';
        bubble.className = 'typing-bubble';
        bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function hideTypingBubble() {
    const bubble = document.getElementById('typing-bubble');
    if (bubble) bubble.remove();
}

// Load & display contacts from Firestore
function loadContacts() {
    console.log('Loading contacts...');
    db.collection('users').onSnapshot((snapshot) => {
        console.log('Users found:', snapshot.size);

        // Unsubscribe previous listeners
        contactsLastMsgListeners.forEach(unsub => unsub());
        contactsLastMsgListeners = [];

        contactList.innerHTML = '';

        if (snapshot.empty) {
            contactList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">No friends yet. Share your invite code!</div>';
            return;
        }

        snapshot.forEach((doc) => {
            const u = doc.data();
            const isMe = u.uid === currentUser.uid;
            const label = isMe ? u.name + ' (You)' : u.name;
            const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=random`;

            const el = document.createElement('div');
            el.className = 'contact-item';
            el.id = `contact-item-${u.uid}`;
            el.innerHTML = `
                <div class="avatar-wrap">
                    <img src="${avatarUrl}" class="contact-avatar" alt="${label}">
                    ${u.isOnline ? '<span class="avatar-online-badge" id="online-badge-' + u.uid + '" title="Online"></span>' : ''}
                </div>
                <div class="contact-info">
                    <div class="contact-name-time">
                        <span class="contact-name">${label}</span>
                        <span class="contact-time" id="time-${u.uid}"></span>
                    </div>
                    <div class="contact-last-msg">
                        <span class="last-msg-text" id="last-msg-${u.uid}">Tap to chat</span>
                        <span class="unread-dot" id="dot-${u.uid}" style="display:none;" title="New message"></span>
                    </div>
                </div>`;
            el.addEventListener('click', () => openChat(u, avatarUrl));
            contactList.appendChild(el);

            if (!isMe) {
                const chatId = [currentUser.uid, u.uid].sort().join('_');
                const lastMsgEl = el.querySelector(`#last-msg-${u.uid}`);
                const timeEl = el.querySelector(`#time-${u.uid}`);
                const dotEl = el.querySelector(`#dot-${u.uid}`);

                const unsub = db.collection('chats').doc(chatId)
                    .collection('messages')
                    .orderBy('createdAt', 'desc')
                    .limit(1)
                    .onSnapshot((msgSnap) => {
                        if (!msgSnap.empty) {
                            const lastMsg = msgSnap.docs[0].data();

                            // Format timestamp
                            if (lastMsg.createdAt && timeEl) {
                                const date = lastMsg.createdAt.toDate ? lastMsg.createdAt.toDate() : new Date(lastMsg.createdAt);
                                timeEl.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            }

                            // Format preview text
                            let previewText = 'Tap to chat';
                            if (lastMsg.type === 'image') previewText = '📷 Photo';
                            else if (lastMsg.type === 'video') previewText = '🎥 Video';
                            else if (lastMsg.text) previewText = lastMsg.text;

                            if (lastMsgEl) {
                                lastMsgEl.textContent = (lastMsg.senderId === currentUser.uid ? 'You: ' : '') + previewText;
                            }

                            // Unread check
                            const isFromOther = lastMsg.senderId !== currentUser.uid;
                            const isCurrentlyOpen = (currentChatId === chatId && !isSecretRoom && activeChat.style.display === 'flex');
                            const lastReadTimestamp = parseInt(localStorage.getItem('lastRead_' + chatId) || '0', 10);
                            const msgTimestamp = lastMsg.createdAt?.toMillis ? lastMsg.createdAt.toMillis() : (lastMsg.createdAt ? new Date(lastMsg.createdAt).getTime() : Date.now());

                            if (isFromOther && !isCurrentlyOpen && msgTimestamp > lastReadTimestamp) {
                                dotEl.style.display = 'inline-block';
                                el.classList.add('has-unread');
                            } else {
                                dotEl.style.display = 'none';
                                el.classList.remove('has-unread');
                            }
                        } else {
                            if (lastMsgEl) lastMsgEl.textContent = 'Tap to chat';
                            if (timeEl) timeEl.textContent = '';
                            if (dotEl) dotEl.style.display = 'none';
                            el.classList.remove('has-unread');
                        }
                    }, (err) => {
                        console.warn('Could not listen to last message for ' + u.uid, err);
                    });

                contactsLastMsgListeners.push(unsub);
            }
        });
    }, (err) => {
        console.error('Firestore error:', err);
        contactList.innerHTML = `<div style="padding:20px;color:red;">Error: ${err.message}</div>`;
    });
}

// Helper to get Firestore messages collection (regular chat or secret room)
function getMessagesCollection() {
    if (isSecretRoom) {
        return db.collection('secret_rooms').doc(currentChatId).collection('messages');
    }
    return db.collection('chats').doc(currentChatId).collection('messages');
}

// Convert user-entered secret passphrase into safe Firestore doc ID
function getRoomId(key) {
    const clean = key.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
        hash = ((hash << 5) - hash) + clean.charCodeAt(i);
        hash |= 0;
    }
    const safeSnippet = clean.replace(/[^a-z0-9]/g, '_').substring(0, 16);
    return 'room_' + Math.abs(hash).toString(36) + (safeSnippet ? '_' + safeSnippet : '');
}

// Open regular chat with contact
function openChat(contact, avatarUrl) {
    isSecretRoom = false;
    currentSecretKey = null;
    currentActiveContact = contact;

    if (leaveSecretBtn) leaveSecretBtn.style.display = 'none';
    if (copySecretKeyBtn) copySecretKeyBtn.style.display = 'none';
    if (clearSecretBtn) clearSecretBtn.style.display = 'none';

    currentChatId = [currentUser.uid, contact.uid].sort().join('_');
    chatName.textContent = contact.name;
    chatAvatar.src = avatarUrl;

    // Listen to contact live online / last seen status
    if (activeContactListener) activeContactListener();
    activeContactListener = db.collection('users').doc(contact.uid).onSnapshot((doc) => {
        if (!doc.exists) return;
        currentActiveContact = doc.data();
        if (!isPartnerTyping) {
            renderContactOnlineStatus(currentActiveContact);
        }
    });

    // Listen to partner typing in this chat
    listenToTyping(contact.uid);

    // Mark as read immediately
    localStorage.setItem('lastRead_' + currentChatId, Date.now().toString());
    const dot = document.getElementById(`dot-${contact.uid}`);
    if (dot) dot.style.display = 'none';
    const item = document.getElementById(`contact-item-${contact.uid}`);
    if (item) item.classList.remove('has-unread');

    noChatSelected.style.display = 'none';
    activeChat.style.display = 'flex';

    if (window.innerWidth <= 768) {
        sidebar.style.display = 'none';
        chatArea.style.display = 'flex';
        backBtn.style.display = 'block';
    }

    loadMessages();
}

// Join a Secret 2-Person Room
function joinSecretRoom(passphrase) {
    if (activeContactListener) activeContactListener();
    currentActiveContact = null;
    isSecretRoom = true;
    currentSecretKey = passphrase.trim();
    currentChatId = getRoomId(currentSecretKey);

    chatName.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><i class="ph ph-lock-key ph-bold" style="color:var(--accent)"></i> Secret Room</span>`;
    chatAvatar.src = `https://ui-avatars.com/api/?name=Secret+Room&background=005c4b&color=ffffff`;
    if (chatStatus) {
        chatStatus.textContent = `🔒 Key: ${currentSecretKey}`;
    }

    listenToTyping(null);

    if (leaveSecretBtn) leaveSecretBtn.style.display = 'flex';
    if (copySecretKeyBtn) copySecretKeyBtn.style.display = 'flex';
    if (clearSecretBtn) clearSecretBtn.style.display = 'flex';

    noChatSelected.style.display = 'none';
    activeChat.style.display = 'flex';

    if (window.innerWidth <= 768) {
        sidebar.style.display = 'none';
        chatArea.style.display = 'flex';
        backBtn.style.display = 'block';
    }

    loadMessages();
}

// Leave Secret Room
function leaveSecretRoom() {
    setMyTyping(false);
    if (activeContactListener) activeContactListener();
    if (activeTypingListener) activeTypingListener();
    hideTypingBubble();

    isSecretRoom = false;
    currentSecretKey = null;
    currentChatId = null;

    if (messagesListener) messagesListener();

    if (leaveSecretBtn) leaveSecretBtn.style.display = 'none';
    if (copySecretKeyBtn) copySecretKeyBtn.style.display = 'none';
    if (clearSecretBtn) clearSecretBtn.style.display = 'none';
    if (chatStatus) chatStatus.textContent = 'Online';

    activeChat.style.display = 'none';
    noChatSelected.style.display = 'flex';

    if (window.innerWidth <= 768) {
        sidebar.style.display = 'flex';
        chatArea.style.display = 'none';
        backBtn.style.display = 'none';
    }
}

// Back button handler
backBtn.addEventListener('click', () => {
    setMyTyping(false);
    if (activeContactListener) activeContactListener();
    if (activeTypingListener) activeTypingListener();
    hideTypingBubble();

    if (isSecretRoom) {
        leaveSecretRoom();
        return;
    }
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
    messagesListener = getMessagesCollection().orderBy('createdAt', 'asc')
        .onSnapshot((snapshot) => {
            chatMessages.innerHTML = '';
            snapshot.forEach((doc) => {
                const msg = doc.data();
                const isMine = msg.senderId === currentUser.uid;
                const time = msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
                const senderTag = (isSecretRoom && !isMine && msg.senderName) 
                    ? `<span class="message-sender">${msg.senderName}</span>` 
                    : '';
                const div = document.createElement('div');
                div.className = `message ${isMine ? 'message-sent' : 'message-received'}`;

                if (msg.type === 'image') {
                    div.innerHTML = `
                        ${senderTag}
                        <img src="${msg.mediaUrl}" alt="Image" class="chat-image"
                             onclick="window.open('${msg.mediaUrl}', '_blank')">
                        <span class="message-time">${time}</span>`;
                } else if (msg.type === 'video') {
                    div.innerHTML = `
                        ${senderTag}
                        <video src="${msg.mediaUrl}" controls class="chat-image"></video>
                        <span class="message-time">${time}</span>`;
                } else {
                    div.innerHTML = `${senderTag}${msg.text}<span class="message-time">${time}</span>`;
                }

                chatMessages.appendChild(div);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;

            if (isPartnerTyping) {
                showTypingBubble();
            }

            if (currentChatId && !isSecretRoom) {
                localStorage.setItem('lastRead_' + currentChatId, Date.now().toString());
            }
        });
}

// Send message
async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    if (!currentChatId) {
        alert('Please select a friend or join a Secret Room first!');
        return;
    }

    clearTimeout(myTypingTimeout);
    setMyTyping(false);

    msgInput.value = '';
    msgInput.focus();

    try {
        await getMessagesCollection().add({
            text: text,
            senderId: currentUser.uid,
            senderName: currentUserName || (currentUser.email ? currentUser.email.split('@')[0] : 'User'),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error('Failed to send message:', err);
        msgInput.value = text; // restore text if failed
        alert('Failed to send message: ' + err.message);
    }
}

// --- MEDIA UPLOAD ---
attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file || !currentChatId) return;

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

    const uploadDiv = document.createElement('div');
    uploadDiv.className = 'message message-sent';
    uploadDiv.innerHTML = `<span style="color:var(--text-secondary)">⏳ Uploading...</span>`;
    chatMessages.appendChild(uploadDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const filePath = isSecretRoom
            ? `secret_rooms/${currentChatId}/${Date.now()}_${file.name}`
            : `chats/${currentChatId}/${Date.now()}_${file.name}`;
        const storageRef = storage.ref(filePath);
        const uploadTask = await storageRef.put(file);
        const mediaUrl = await uploadTask.ref.getDownloadURL();

        await getMessagesCollection().add({
            type: isVideo ? 'video' : 'image',
            mediaUrl: mediaUrl,
            senderId: currentUser.uid,
            senderName: currentUserName || (currentUser.email ? currentUser.email.split('@')[0] : 'User'),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        alert('Upload failed: ' + err.message);
    } finally {
        fileInput.value = '';
        uploadDiv.remove();
    }
});

// --- SEND TEXT MESSAGE & TYPING LISTENERS ---
sendBtn.addEventListener('click', sendMessage);

msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// Live typing broadcast while user is typing
msgInput.addEventListener('input', () => {
    if (!currentChatId) return;
    setMyTyping(true);
    clearTimeout(myTypingTimeout);
    myTypingTimeout = setTimeout(() => {
        setMyTyping(false);
    }, 2500);
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

// --- SECRET ROOM MODAL & ACTIONS ---
if (openSecretModalBtn) {
    openSecretModalBtn.addEventListener('click', () => {
        secretKeyInput.value = '';
        secretError.textContent = '';
        secretModal.style.display = 'flex';
        secretKeyInput.focus();
    });
}

if (closeSecretModal) {
    closeSecretModal.addEventListener('click', () => {
        secretModal.style.display = 'none';
    });
}

if (secretModal) {
    secretModal.addEventListener('click', (e) => {
        if (e.target === secretModal) secretModal.style.display = 'none';
    });
}

if (generateKeyBtn) {
    generateKeyBtn.addEventListener('click', () => {
        const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
        let rand = '';
        for (let i = 0; i < 6; i++) {
            rand += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        secretKeyInput.value = 'secret_' + rand;
    });
}

if (enterSecretRoomBtn) {
    enterSecretRoomBtn.addEventListener('click', () => {
        const key = secretKeyInput.value.trim();
        if (!key) {
            secretError.textContent = 'Please enter a secret passphrase.';
            return;
        }
        if (key.length < 3) {
            secretError.textContent = 'Passphrase must be at least 3 characters.';
            return;
        }
        secretModal.style.display = 'none';
        joinSecretRoom(key);
    });
}

if (secretKeyInput) {
    secretKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            enterSecretRoomBtn.click();
        }
    });
}

if (leaveSecretBtn) {
    leaveSecretBtn.addEventListener('click', leaveSecretRoom);
}

if (copySecretKeyBtn) {
    copySecretKeyBtn.addEventListener('click', async () => {
        if (!currentSecretKey) return;
        try {
            await navigator.clipboard.writeText(currentSecretKey);
            alert(`Secret Passphrase "${currentSecretKey}" copied to clipboard! Share it with your partner.`);
        } catch {
            prompt('Copy your secret passphrase:', currentSecretKey);
        }
    });
}

if (clearSecretBtn) {
    clearSecretBtn.addEventListener('click', async () => {
        if (!currentChatId || !isSecretRoom) return;
        if (!confirm('Are you sure you want to delete all messages in this Secret Room for both of you?')) return;

        try {
            const snap = await getMessagesCollection().get();
            const batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } catch (err) {
            alert('Failed to clear room: ' + err.message);
        }
    });
}

