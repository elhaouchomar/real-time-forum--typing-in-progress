import * as spa from "./spa.js";



let globalUserID = null;
let globalUsername = null;

function fetchUserData() {
    fetch("/api/userdata")
        .then(response => {
            if (!response.ok) {
                throw new Error("Failed to fetch user data");
            }
            return response.json();
        })
        .then(data => {
            globalUserID = data.user_id;
            globalUsername = data.username;
            console.log("User ID:", globalUserID);
            console.log("Username:", globalUsername);
        })
        .catch(error => console.error("Error fetching user data:", error));
}

// استدعاء الدالة عند تحميل الصفحة
fetchUserData();


// Chat Vars
export let ws;
let userID = 0;
let isLoading = false;
let messageOffset = 0;
const MESSAGES_PER_PAGE = 10;
// DOM Elements
const ignore = document.getElementById("message");

function initializeDOMElements() {
  window.ignore = document.getElementById("message");
  window.post = document.getElementById("posts");
  window.right_side_bare = document.getElementById("categories");
  window.area_msg = document.getElementById("area-msg");
  window.notif = document.querySelector(".notif");
  window.friends_list = document.querySelector(".friends-list");
  window.chat_box = document.querySelector(".chat-box");
  window.messageInput = document.getElementById("messageInput");
  window.sendButton = document.querySelector(".send-btn");
  window.messagesArea =
    document.getElementById("messages") ||
    document.getElementById("messages-area");
  window.r = document.getElementById("user-receiver");
  window.chat = document.getElementById("chat");
  window.friend_avatar =
    document.querySelector(".friend-profile") ||
    document.querySelector(".friend-avatar");
}

export function initChat() {
  initializeDOMElements();
  const chat = document.getElementById("chat");
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.getElementById("sendButton");
  // Event Listeners
  document.addEventListener("click", handleDocumentClick);
  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keypress", handleKeyPress);

  if (window.innerWidth <= 780) {
    const friend = document.querySelector(".friend");
    const back = document.querySelector(".back");
    const close_message = document.querySelector(".close-message");

    if (friend) friend.addEventListener("click", showChatBox);
    if (back) back.addEventListener("click", showFriendsList);
    if (close_message)
      close_message.addEventListener("click", closeMessageArea);
  }
}

function handleDocumentClick(event) {
  const messageElement = event.target.closest("#message");
  const post = document.getElementById("posts");
  const right_side_bare = document.getElementById("categories");
  const area_msg = document.getElementById("area-msg");

  if (messageElement) {
    area_msg.style.display = "flex";
    right_side_bare.style.display = "none";
    post.style.display = "none";
  }
}

function handleKeyPress(e) {
  if (e.key === "Enter") {
    sendMessage();
  }
}

function showChatBox() {
  if (window.friends_list && window.chat_box) {
    window.friends_list.style.display = "none";
    window.chat_box.style.display = "flex";
  }
}

function showFriendsList() {
  if (window.friends_list && window.chat_box) {
    window.friends_list.style.display = "block";
    window.chat_box.style.display = "none";
  }
}

function closeMessageArea() {
  if (window.area_msg && window.post && window.notif) {
    window.area_msg.style.display = "none";
    window.post.style.display = "flex";
    window.notif.style.display = "flex";
  }
}


// WebSocket Functions
export function connectWebSocket() {
  try {
    ws = new WebSocket("ws://localhost:9090/ws");

    ws.onopen = () => console.log("Connected to chat server");
    ws.onmessage = handleWebSocketMessage;
    ws.onerror = (event) => console.error("WebSocket error:", event);
    ws.onclose = () => {
      console.log("Disconnected from chat server, attempting to reconnect...");
      setTimeout(connectWebSocket, 5000);
    };
  } catch (error) {
    console.error("WebSocket connection error:", error);
    setTimeout(connectWebSocket, 5000);
  }
}

function handleWebSocketMessage(event) {
  try {
    const data = JSON.parse(event.data);
    // console.log(data);
    
    // if (data.type === "user_info") {
    //   window.currentUserId = data.user_id;
    //   window.currentUsername = data.username;
    //   console.log("User data received:", data);
    //   return
    // }

    if (data.type === "users_list") {
      addFriend(
        data.usernames,
        data.user_ids,
        data.user_statuses,
        data.last_messages,
        data.last_times,
        data.unread_counts
      );
      return;
    }
    if (data.type === "message") {
      console.log("Message data received:", data); // Logging the message data

      if (data.content) {
        console.log("Message content:", data.content); // Check if message content exists

        handleIncomingMessage(data); // Pass the data to handle the message
      } else {
        console.error("No message content in the data!");
      }
    }

    // if (data.type === "typing_status") {
    //   document.querySelectorAll(".friend").forEach((friend) => {
    //     const userElement = friend.querySelector(`#user-${data.sender_id}`);
    //     if (userElement) {
    //       const lastMessage = friend.querySelector(".last-message");
    //       if (lastMessage) {
    //         if (data.is_typing) {
    //           if (!lastMessage.dataset.originalText) {
    //             lastMessage.dataset.originalText = lastMessage.innerText;
    //           }
    //           lastMessage.innerText = "Typing...";
    //         } else {
    //           lastMessage.innerText = lastMessage.dataset.originalText || "Last message";
    //           delete lastMessage.dataset.originalText;
    //         }
    //       }
    //     }
    //   });
    //   console.log("User data received:", data);

    // }
  } catch (error) {
    console.error("Error processing WebSocket message:", error);
  }
}

// function setupTypingListener() {
//   const input = document.getElementById("messageInput");

//   if (!input) {
//     console.error("Message input element not found");
//     return;
//   }

//   input.removeEventListener("input", handleTyping);
//   input.removeEventListener("blur", handleBlur);

//   input.addEventListener("input", handleTyping);
//   input.addEventListener("blur", handleBlur);

//   sendTypingStatus(false);
// }

// function handleTyping() {
//   clearTimeout(typingTimeout);
//   sendTypingStatus(true);

//   typingTimeout = setTimeout(() => {
//     sendTypingStatus(false);
//   }, typingDelay);
// }

// function handleBlur() {
//   clearTimeout(typingTimeout);
//   sendTypingStatus(false);
// }

// function sendTypingStatus(isTyping) {
//   if (!currentReceiverId) {
//     console.warn("No receiver ID set for typing status");
//     return;
//   }

//   const message = {
//     type: "typing_status",
//     sender_id: currentUserId,
//     sender_username: currentUsername,
//     receiver_id: currentReceiverId,
//     receiver_username: currentReceiverUsername,
//     is_typing: isTyping,
//   };

//   if (ws && ws.readyState === WebSocket.OPEN) {
//     ws.send(JSON.stringify(message));
//   } else {
//     console.warn("WebSocket not connected, cannot send typing status");
//   }
// }

// window.onload = function () {
//   connectWebSocket();
//   setupTypingListener();
// };

function handleIncomingMessage(data) {
  const time = new Date(data.timestamp || new Date()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // Get the active user ID (receiver of the current chat)
  let activeUserId = getActiveChatUserId();

  // // Ensure that the active user is the one that the message is intended for
  console.log("Active User ID:", activeUserId, "Sender ID:", data.sender_id);

  if (!activeUserId || activeUserId != data.sender_id) {
    // The message is not for the active chat user, so ignore or show notification
    console.log(
      "Message is from another user. You can show a notification here."
    );
    return;
  }

  // if (activeUserId === data.sender_id) {
    // Ensure the message container exists
    const messagesContainer =
      window.messagesArea ||
      document.getElementById("messages") ||
      document.getElementById("messages-area");

    if (messagesContainer) {
      // Create the message element and append it to the messages container
      const messageElement = createMessageElement(
        data.content,
        time,
        "received",
        data.username // The sender's username
      );
      messagesContainer.appendChild(messageElement);
      messagesContainer.scrollTop = messagesContainer.scrollHeight; // Scroll to bottom
    } else {
      console.error("Messages container not found!");
    }
  // } else {
  //   console.log("Message is from another user.");
  // }
}


function getActiveChatUserId() {
  const statusElement = document.querySelector(".status[id^='user-status-']");
  if (statusElement && statusElement.id) {
    const matches = statusElement.id.match(/user-status-(\d+)/);
    if (matches && matches[1]) {
      return parseInt(matches[1]);
    }
  }
  const alternativeStatus = document.querySelector(".status[id^='user-']");
  if (alternativeStatus && alternativeStatus.id) {
    const matches = alternativeStatus.id.match(/user-(\d+)/);
    if (matches && matches[1]) {
      return parseInt(matches[1]);
    }
  }
  return userID || currentUserId;
}

function sendMessage() {
  const messageInput = document.getElementById("messageInput");
  const message = messageInput.value.trim();
  const messagesArea = document.getElementById("messages");
  

  let currentReceiverId = getActiveChatUserId()

  // Ensure the user and receiver are set
  // if (!window.currentUserId || !window.currentUsername ) {
  //   console.warn("User or receiver data not available, cannot send message.");
  //   return;
  // }

  if (message) {
    const time = new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    if (ws.readyState === WebSocket.OPEN) {
      const msgData = {
        type: "message",
        content: message,
        sender_id: globalUserID, // Sender ID
        // username: globalUsername, // Sender Username
        receiver_id: currentReceiverId, // Receiver ID
        // receiver_username: currentReceiverUsername, // Receiver Username
        timestamp: new Date().toISOString(),
      };

      // Send the message data through WebSocket
      ws.send(JSON.stringify(msgData));

      // Display the message in the UI
      const messageDiv = createMessageElement(message, time, "sent", globalUsername);
      messagesArea.appendChild(messageDiv);
      messageInput.value = ""; // Clear input field
      messagesArea.scrollTop = messagesArea.scrollHeight; // Scroll to bottom
    } else {
      console.warn("WebSocket not connected, message not sent.");
    }
  }
}

function createMessageElement(content, time, type, username) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `messages ${type}`;

  // Add a line break if content is more than 30 characters
  const formattedContent =
    content.length > 30 ? content.replace(/(.{30})/g, "$1<br>") : content;

  messageDiv.innerHTML = `
    <div class="message-bubble">
      <div class="message-content">${formattedContent}</div>
      <div class="message-time">${time}</div>
    </div>
    <div class="message-author">${username}</div>
  `;
  return messageDiv;
}
export function displayMessage(message, currentUserId) {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const isSent = parseInt(message.sender_id) !== parseInt(currentUserId);
  console.log("Is Sent  ;", isSent);

  return createMessageElement(
    message.content,
    time,
    isSent ? "sent" : "received",
    message.sender_name
  );
}

function addFriend(
  friends,
  userIds,
  userStatuses,
  lastMessages,
  lastTimes,
  unreadCounts
) {
  const friendsList = document.querySelector(".allfriends");
  const messagesArea = document.getElementById("messages");

  if (!friendsList) {
    console.error("friendsList is not found in the DOM!");
    return;
  }

  friendsList.innerHTML = "";

  if (friends) {
    friends.forEach((friend) => {
      const userId = userIds[friend];
      const status = userStatuses[friend] || "offline";
      const lastMessage = lastMessages[friend] || "No messages yet";
      const unreadCount = unreadCounts[friend] || 0;
      const lastTime = lastTimes[friend]
        ? new Date(lastTimes[friend]).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "—";

      const friendElement = document.createElement("div");
      friendElement.className = "friend";
      if (unreadCount > 0) {
        friendElement.classList.add("has-unread");
      }

      friendElement.innerHTML = `
        <div class="friend-avatar">
            <img src="../../assets/images/profile.png" class="profile-img" alt="${friend}">
            <div class="status ${status}" id="user-${userId}"></div>
        </div>
        <div class="friend-info">
            <div>
              <div class="friend-name">${friend}</div>
                <div class="last-message">${
                  lastMessage.length > 30
                    ? lastMessage.substring(0, 15) + "..."
                    : lastMessage
                }</div>
          </div>
          <div class="time-notif">
              <div class="last-time">${lastTime}</div>
              <div class="notification ${
                unreadCount === 0 ? "hidden" : ""
              }">${unreadCount}</div>
          </div>
      </div>`;

      friendElement.addEventListener("click", () => {
        handleFriendClick(friend, userId, status, unreadCount);
      });

      friendsList.appendChild(friendElement);
      messagesArea.scrollTop = messagesArea.scrollHeight;
    });
  }
}

// friendElement.addEventListener("click", () => {
//   messagesArea.innerHTML = "";
//   const show_user = document.getElementById("user-receiver");
//   friends_list.style.display = window.innerWidth <= 780 ? "none" : "block";
//   chat_box.style.display = "flex";
//   show_user.innerText = friend;
//   messageOffset = 0;
//   fetchChatHistory(userId, messageOffset);
//   if (messagesArea && userID == 0) {
//     userID = userId;
//     messagesArea.addEventListener("scroll", async () => {
//       if (messagesArea.scrollTop === 0 && !isLoading && userID !== 0) {
//         isLoading = true;
//         await fetchChatHistory(userID, messageOffset);
//         isLoading = false;
//       }
//     });
//   }
// });

// friendsList.appendChild(friendElement);

function handleFriendClick(friend, userId, status, unreadCount) {
  console.log(userId);

  console.log("Friend clicked:", friend, "ID:", userId);
  if (unreadCount > 0) {
    markMessagesAsRead(userId);
  }
  if (window.messagesArea) {
    window.messagesArea.innerHTML = "";
  } else {
    console.error("Messages area not found!");
    return;
  }
  if (window.r) window.r.innerText = friend;
  if (window.friends_list)
    window.friends_list.style.display =
      window.innerWidth <= 780 ? "none" : "block";
  if (window.chat_box) window.chat_box.style.display = "flex";

  if (window.friend_avatar) {
    window.friend_avatar.innerHTML = `
      <div class="friend-avatar">
        <img src="../../assets/images/profile.png" class="profile-img" alt="${friend}">
        <div class="status ${status}" id="user-status-${userId}"></div>
      </div>`;
  }

  /////////////////////////////////////////////////////////////////////////////////////
  // const input = document.querySelector(".msg-input");
  // console.log(input);

  // if (!input) {
  //   console.error("'msg-input'");
  //   return;
  // }

  // sendTypingStatus(userId, false);
  // console.log(userId, false);

  // input.addEventListener("keydown", function () {
  //   clearTimeout(typingTimeout);

  //   sendTypingStatus(userId, true);

  //   typingTimeout = setTimeout(() => {
  //     sendTypingStatus(userId, false);
  //   }, typingDelay);
  // });

  // input.addEventListener("keyup", function () {
  //   clearTimeout(typingTimeout);

  //   typingTimeout = setTimeout(() => {
  //     sendTypingStatus(userId, false);
  //   }, typingDelay);
  // });
  ////////////////////////////////////////////

  messageOffset = 0;
  fetchChatHistory(userId, messageOffset);
  setupScrollListener(userId);
}

function setupScrollListener(userId) {
  if (!window.messagesArea) return;

  const oldElement = window.messagesArea;
  const newElement = oldElement.cloneNode(true);
  oldElement.parentNode.replaceChild(newElement, oldElement);
  window.messagesArea = newElement;

  window.messagesArea.addEventListener("scroll", async () => {
    if (window.messagesArea.scrollTop === 0 && !isLoading) {
      isLoading = true;
      await fetchChatHistory(userId, messageOffset);
      isLoading = false;
    }
  });
}

// Chat History Functions
async function fetchChatHistory(userId, offset = 0) {
  try {
    if (!window.messagesArea) {
      console.error("Messages area not found!");
      return 0;
    }

    const response = await fetch(
      `/api/chat/history?user_id=${userId}&offset=${offset}`,
      {
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error(`Error fetching chat history: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.messages || data.messages.length === 0) {
      if (offset === 0 && window.messagesArea.children.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "no-messages";
        emptyMessage.textContent = "No messages yet. Start a conversation!";
        window.messagesArea.appendChild(emptyMessage);
      }
      return 0;
    }

    console.log("Fetched messages:", data.messages);

    if (typeof window.messageOffset === "undefined") {
      window.messageOffset = 0;
    }
    window.messageOffset += data.messages.length;

    const fragment = document.createDocumentFragment();

    data.messages.forEach((message) => {
      if (!document.querySelector(`[data-message-id="${message.id}"]`)) {
        const messageDiv = displayMessage(message, userId);
        messageDiv.setAttribute("data-message-id", message.id);
        fragment.prepend(messageDiv);
      }
    });

    window.messagesArea.prepend(fragment);

    if (offset === 0) {
      window.messagesArea.scrollTop = window.messagesArea.scrollHeight;
    } else {
      window.messagesArea.scrollTop = 60;
    }

    return data.messages.length;
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return 0;
  }
}

function markMessagesAsRead(receiverId) {
  console.log("Sending request to mark messages as read:", {
    receiver_id: receiverId,
  });

  fetch("/api/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      receiver_id: receiverId,
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("error in markmessage read");
      }
      // Update the friend list notification
      const friendElement = document.querySelector(
        `.friend:has([id="user-${receiverId}"])`
      );
      if (friendElement) {
        friendElement.classList.remove("has-unread");
        const notifElement = friendElement.querySelector(".notification");
        if (notifElement) {
          notifElement.classList.add("hidden");
          notifElement.textContent = "0";
        }
      }
    })
    .catch((error) => {
      console.error(error);
    });
}

// function sendTypingStatus(receiverId, isTyping) {
//   if (!receiverId) {
//     console.warn("No receiverID provided");
//     return;
//   }

//   fetch("/check-typing", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       receiver_id: receiverId,
//       is_typing: isTyping,
//     }),
//   })
//     .then((response) => {
//       if (!response.ok) {
//         throw new Error("Error in updating typing status");
//       }
//       const receiverElement = document.querySelector(
//         `.friend:has([id="user-${receiverId}"])`
//       );
//       if (receiverElement) {
//         const lastMessage = receiverElement.querySelector(".last-message");
//         if (lastMessage && isTyping) {
//           lastMessage.innerText = "Typing...";
//         } else if (lastMessage && !isTyping) {
//           lastMessage.innerText = "";
//         }
//       }
//     })
//     .catch((error) => {
//       console.error("Error updating typing status:", error);
//     });
// }
