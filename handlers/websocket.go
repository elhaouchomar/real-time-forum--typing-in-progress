// handlers/chat.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"sync"
	"time"

	wsLib "github.com/gorilla/websocket"
)

var (
	upgrader = wsLib.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	// Thread-safe connected users map
	connectedUsers = struct {
		sync.RWMutex
		m map[int]*UserConnection
	}{m: make(map[int]*UserConnection)}
)

type UserConnection struct {
	Conn     *wsLib.Conn
	Username string
	UserID   int
}


func GetUsers(userID int) ([]string, error) {
	var users []string
	rows, err := DB.Query("SELECT username FROM users WHERE id != ?;", userID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var username string
		err := rows.Scan(&username)
		if err != nil {
			return nil, err
		}
		users = append(users, username)
	}
	return users, nil
}

type Message struct {
    ID        int       `json:"id"`
    Content   string    `json:"content"`
    SenderID  int       `json:"sender_id"`
    ReceiverID int       `json:"receiver_id"`
    Timestamp time.Time `json:"timestamp"`
    Type      string    `json:"type"`
    Username  string    `json:"username"`
    IsTyping  *bool     `json:"is_typing"`
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    userID, err := CheckAuthentication(w, r)
    if err != nil {
        return
    }
    
    var username string
    err = DB.QueryRow("SELECT username FROM users WHERE id = ?;", userID).Scan(&username)
    if err != nil {
        http.Error(w, "User not found", http.StatusNotFound)
        return
    }
    
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("WebSocket upgrade error: %v", err)
        return
    }
    
    userConn := &UserConnection{
        Conn:     conn,
        Username: username,
        UserID:   userID,
    }
    
    connectedUsers.Lock()
    connectedUsers.m[userID] = userConn
    connectedUsers.Unlock()
    
    BroadcastUsersList()
    broadcastStatus(userID, username, true)
    
    defer func() {
        conn.Close()
        connectedUsers.Lock()
        delete(connectedUsers.m, userID)
        connectedUsers.Unlock()
        broadcastStatus(userID, username, false)
    }()
    
	BroadcastUsersList()
    for {
        broadcastStatus(userID, username, false)
        var msg Message
        err := conn.ReadJSON(&msg)
        fmt.Println(msg)
        if err != nil {
            if !wsLib.IsCloseError(err, wsLib.CloseGoingAway, wsLib.CloseAbnormalClosure) {
                log.Printf("WebSocket read error: %v", err)
            }
            break
        }
        
        log.Printf("Received message: %+v", msg)
        
        if msg.Type == "typing" {
            if msg.IsTyping == nil {
                tmpBool := false
                msg.IsTyping = &tmpBool
            }
            
            log.Printf("Processing typing message: SenderID=%d, ReceiverID=%d, IsTyping=%t", 
                      msg.SenderID, msg.ReceiverID, *msg.IsTyping)
            
            msg.SenderID = userID
            
            if msg.ReceiverID != 0  && msg.SenderID != msg.ReceiverID{
                sendTypingNotification(msg.SenderID, msg.ReceiverID, *msg.IsTyping)
            } else {
                log.Printf("Cannot send typing status: invalid receiver ID")
            }
            continue
        }
        
        var receiver_id int
        err = DB.QueryRow("SELECT id FROM users WHERE username = ?;", msg.Username).Scan(&receiver_id)
        if err != nil || receiver_id == userID {
            log.Printf("Error getting receiver ID: %v", err)
            continue
        }
        
        msg.SenderID = userID
        msg.ReceiverID = receiver_id
        msg.Timestamp = time.Now()
        
        err = saveMessage(msg)
        if err != nil {
            log.Printf("Error saving message: %v", err)
            continue
        }
        
        sendPrivateMessage(msg)
    }
}

func sendTypingNotification(senderID, receiverID int, isTyping bool) {
    log.Printf("Sending typing notification: Sender=%d, Receiver=%d, Typing=%t", 
              senderID, receiverID, isTyping)
    
    typingStatus := Message{
        Type:      "typing",
        SenderID:  senderID,
        ReceiverID: receiverID,
        IsTyping:  &isTyping,
    }
    
    connectedUsers.RLock()
    defer connectedUsers.RUnlock()
    
    if receiver, ok := connectedUsers.m[receiverID]; ok {
        err := receiver.Conn.WriteJSON(typingStatus)
        if err != nil {
            log.Printf("Error sending typing status to user %d: %v", receiverID, err)
        } else {
            log.Printf("Successfully sent typing status to user %d", receiverID)
        }
    } else {
        log.Printf("Receiver %d not connected", receiverID)
    }
}


func broadcastMessage(msg Message) {
	connectedUsers.RLock()
	defer connectedUsers.RUnlock()

	for _, conn := range connectedUsers.m {
		if conn.UserID != msg.SenderID {
			err := conn.Conn.WriteJSON(msg)
			if err != nil {
				log.Printf("Error sending message to user %d: %v", conn.UserID, err)
			}
		}
	}
}

func saveMessage(msg Message) error {
	query := `INSERT INTO messages (content, sender_id, receiver_id, timestamp) 
              VALUES (?, ?, ?, ?)`
	result, err := DB.Exec(query, msg.Content, msg.SenderID, msg.ReceiverID, msg.Timestamp)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	msg.ID = int(id)
	return nil
}

func broadcastStatus(userID int, username string, online bool) {
	status := Message{
		Type:      "status",
		Content:   username,
		SenderID:  userID,
		Timestamp: time.Now(),
	}
	if online {
		status.Content = "online"
	} else {
		status.Content = "offline"
	}
	broadcastMessage(status)
}

type UsersList struct {
	Type         string               `json:"type"`
	Usernames    []string             `json:"usernames"`
	UserStatuses map[string]string    `json:"user_statuses"`
	UserIDs      map[string]int       `json:"user_ids"`
	LastMessages map[string]string    `json:"last_messages"`
	LastTimes    map[string]time.Time `json:"last_times"`
	UnreadCounts map[string]int       `json:"unread_counts"` // Added field for unread message counts
}

func BroadcastUsersList() error {
	connectedUsers.Lock()
	defer connectedUsers.Unlock()

	for currentUserID, conn := range connectedUsers.m {
		usernames, err := GetUsers(currentUserID)
		if err != nil {
			log.Printf("Error getting users for user %d: %v", currentUserID, err)
			continue
		}

		userStatuses := make(map[string]string)
		userIDs := make(map[string]int)
		lastMessages := make(map[string]string)
		lastTimes := make(map[string]time.Time)
		unreadCounts := make(map[string]int)

		for _, username := range usernames {
			userID, err := GetUserIDByUsername(username)
			if err != nil {
				log.Printf("Error getting user ID for %s: %v", username, err)
				continue
			}
			userIDs[username] = userID

			// Check if user is online
			userStatuses[username] = "offline"
			for _, c := range connectedUsers.m {
				if c.Username == username {
					userStatuses[username] = "online"
					break
				}
			}

			// Get last message
			var lastMessage string
			var lastTime time.Time
			err = DB.QueryRow(`
				SELECT content, timestamp FROM messages 
				WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) 
				ORDER BY timestamp DESC LIMIT 1`,
				userID, currentUserID, currentUserID, userID,
			).Scan(&lastMessage, &lastTime)

			if err != nil {
				lastMessages[username] = "No messages yet"
				lastTimes[username] = time.Time{}
			} else {
				lastMessages[username] = lastMessage
				lastTimes[username] = lastTime
			}

			// Count unread messages
			var count int
			err = DB.QueryRow("SELECT COUNT(*) FROM messages WHERE sender_id = ? AND receiver_id = ? AND read = 0", userID, currentUserID).Scan(&count)
			if err != nil {
				unreadCounts[username] = 0
			} else {
				unreadCounts[username] = count
			}
		}

		// Sorting users
		sort.Slice(usernames, func(i, j int) bool {

			// Sort by last message timestamp
			if lastTimes[usernames[i]].IsZero() && lastTimes[usernames[j]].IsZero() {
				return usernames[i] < usernames[j] // Sort alphabetically if no timestamps
			}
			if lastTimes[usernames[i]].IsZero() {
				return false
			}
			if lastTimes[usernames[j]].IsZero() {
				return true
			}
			return lastTimes[usernames[i]].After(lastTimes[usernames[j]])
		})

		usersList := UsersList{
			Type:         "users_list",
			Usernames:    usernames,
			UserStatuses: userStatuses,
			UserIDs:      userIDs,
			LastMessages: lastMessages,
			LastTimes:    lastTimes,
			UnreadCounts: unreadCounts,
		}

		err = conn.Conn.WriteJSON(usersList)
		if err != nil {
			log.Printf("Error sending users list to user %d: %v", conn.UserID, err)
		}
	}
	return nil
}

func MarkMessagesAsRead(w http.ResponseWriter, r *http.Request) {
	// Ensure the request method is POST or PUT
	var Data = map[string]any{
		"status":  false,
		"message": "",
	}

	userID, err := CheckAuthentication(w, r)
	if err != nil {
		Data["message"] = "Authonticatoin Not found"
		JsResponse(w, http.StatusInternalServerError, false, Data)
		return
	}
	// Decode request body
	var req struct {
		SenderID   int `json:"sender_id"`
		ReceiverID int `json:"receiver_id"`
	}

	err = json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		Data["message"] = "Invalid JSON data"
		JsResponse(w, http.StatusBadRequest, false, Data)
		return
	}
	req.SenderID = userID
	// Debugging log
	fmt.Printf("Received request to mark messages as read: sender_id=%d, receiver_id=%d\n", req.SenderID, req.ReceiverID)

	// Ensure sender and receiver IDs are valid
	if req.SenderID <= 0 || req.ReceiverID <= 0 {
		Data["message"] = "Invalid sender or receiver ID"
		JsResponse(w, http.StatusBadRequest, false, Data)
		return
	}

	// Update unread messages in the database
	result, err := DB.Exec(`UPDATE messages SET read = 1 WHERE sender_id = ? AND receiver_id = ? AND read = 0;`, req.ReceiverID, req.SenderID)
	if err != nil {
		Data["message"] = "Failed to update messages"
		JsResponse(w, http.StatusBadRequest, false, Data)
		return
	}
	fmt.Println()
	// Debugging log
	rowsAffected, _ := result.RowsAffected()
	fmt.Printf("Rows affected: %d\n", rowsAffected)

	// Check if any rows were affected
	if rowsAffected == 0 {
		// Return success status even if no rows were affected (No unread messages)
		Data["message"] = "No unread messages found, but operation completed successfully"
		JsResponse(w, http.StatusInternalServerError, false, Data)
		return
	}

	// Send success response
	Data["message"] = "Success"
	Data["status"] = true
	JsResponse(w, http.StatusOK, true, Data)
}

func GetUserIDByUsername(username string) (int, error) {
	var id int
	err := DB.QueryRow("SELECT id FROM users WHERE username = ?", username).Scan(&id)
	return id, err
}

func sendPrivateMessage(msg Message) {
	connectedUsers.Lock()
	defer connectedUsers.Unlock()

	if conn, ok := connectedUsers.m[msg.ReceiverID]; ok {
		err := conn.Conn.WriteJSON(msg)
		if err != nil {
			log.Printf("Error sending private message: %v", err)
		}
	} else {
		log.Printf("User %d is not connected", msg.ReceiverID)
	}
}

func HandleUserData(w http.ResponseWriter, r *http.Request) {
	userID, err := CheckAuthentication(w, r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var username string
	err = DB.QueryRow("SELECT username FROM users WHERE id = ?;", userID).Scan(&username)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	userData := map[string]interface{}{
		"user_id":  userID,
		"username": username,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userData)
}
