import { useState, useEffect } from "react";
import { ref, set, update, get, onValue } from "firebase/database";
import { db, auth } from "../firebase";

export default function Lobby({ playerName, setRoomId }) {
  const [joinCode, setJoinCode] = useState("");
  const [playersInRoom, setPlayersInRoom] = useState({});
  const [roomCreated, setRoomCreated] = useState(false);
  const playerId = auth.currentUser.uid;

  // CREATE ROOM
  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();

    // Initialize room with proper level field
    set(ref(db, `rooms/${newRoomId}`), {
      players: { [playerId]: { name: playerName, level: 1 } },
      gameState: {
        turn: playerId,
        scores: { [playerId]: 0 },
        round: 1,
        chaos: false
      }
    });

    setJoinCode(newRoomId); // Subscribe to room
    setRoomCreated(true); // Mark that we created this room
  };

  // JOIN ROOM
  const joinRoom = async () => {
    if (!joinCode) return alert("Enter room code");

    const roomRef = ref(db, `rooms/${joinCode}/players`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      alert("Room does not exist!");
      return;
    }

    // Add player to players with level field
    update(roomRef, { [playerId]: { name: playerName, level: 1 } });

    // Add player to gameState.scores
    const scoreRef = ref(db, `rooms/${joinCode}/gameState/scores`);
    update(scoreRef, { [playerId]: 0 });

    setRoomCreated(true); // Show the waiting screen
  };

  // Copy room code to clipboard
  const copyRoomCode = () => {
    navigator.clipboard.writeText(joinCode);
    alert(`Room code ${joinCode} copied to clipboard!`);
  };

  // Listen to players and auto-start when 2+
  useEffect(() => {
    if (!joinCode || !roomCreated) return;

    const playersRef = ref(db, `rooms/${joinCode}/players`);
    const unsubscribe = onValue(playersRef, (snapshot) => {
      if (snapshot.exists()) {
        const players = snapshot.val();
        setPlayersInRoom(players);

        // Auto-start game if 2+ players
        if (Object.keys(players).length >= 2) {
          setRoomId(joinCode);
        }
      }
    });

    return () => unsubscribe();
  }, [joinCode, roomCreated, setRoomId]);

  return (
    <div style={{ 
      background: "#F3E5AB", 
      color: "#4B3621", 
      minHeight: "100vh", 
      padding: "15px", 
      textAlign: "center", 
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" 
    }}>
      <h1 style={{ 
        fontFamily: "'Courier New', Courier, monospace", 
        fontSize: "clamp(32px, 8vw, 48px)", 
        marginBottom: "10px",
        textShadow: "2px 2px 4px rgba(0,0,0,0.2)"
      }}>
        🪨 Crazy Batu Seremban
      </h1>
      <p style={{ 
        fontSize: "clamp(14px, 3.5vw, 16px)", 
        color: "#6B4C3B", 
        marginBottom: "20px" 
      }}>
        A chaotic twist on the traditional Malaysian game!
      </p>

      {!roomCreated ? (
        <div style={{
          background: "#FFF8DC",
          padding: "30px 20px",
          borderRadius: "20px",
          maxWidth: "500px",
          margin: "0 auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          border: "3px solid #D2691E"
        }}>
          <h2 style={{ color: "#8B4513", marginBottom: "30px", fontSize: "clamp(20px, 5vw, 24px)" }}>Welcome to the Lobby!</h2>
          
          <button 
            onClick={createRoom}
            style={{
              padding: "15px 30px",
              fontSize: "clamp(16px, 4vw, 20px)",
              fontWeight: "bold",
              borderRadius: "12px",
              border: "none",
              background: "#228B22",
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              transition: "0.2s",
              width: "100%",
              marginBottom: "20px",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent"
            }}
            onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
            onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
          >
            🎮 Create New Room
          </button>

          <div style={{ 
            margin: "30px 0", 
            display: "flex", 
            alignItems: "center", 
            gap: "10px" 
          }}>
            <div style={{ flex: 1, height: "2px", background: "#D2691E" }}></div>
            <span style={{ color: "#8B4513", fontWeight: "bold" }}>OR</span>
            <div style={{ flex: 1, height: "2px", background: "#D2691E" }}></div>
          </div>

          <input
            placeholder="Enter Room Code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            style={{
              padding: "15px",
              fontSize: "clamp(16px, 4vw, 18px)",
              borderRadius: "8px",
              border: "2px solid #D2691E",
              width: "100%",
              textAlign: "center",
              fontWeight: "bold",
              letterSpacing: "2px",
              marginBottom: "15px",
              background: "#FFF",
              boxSizing: "border-box",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              color: "#000"
            }}
          />
          <button 
            onClick={joinRoom}
            style={{
              padding: "15px 30px",
              fontSize: "clamp(16px, 4vw, 20px)",
              fontWeight: "bold",
              borderRadius: "12px",
              border: "none",
              background: "#4169E1",
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              transition: "0.2s",
              width: "100%",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent"
            }}
            onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
            onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
          >
            🚪 Join Room
          </button>
        </div>
      ) : (
        <div style={{
          background: "#FFF8DC",
          padding: "30px 20px",
          borderRadius: "20px",
          maxWidth: "500px",
          margin: "0 auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          border: "3px solid #D2691E"
        }}>
          <h2 style={{ color: "#8B4513", marginBottom: "20px", fontSize: "clamp(20px, 5vw, 24px)" }}>Room Created!</h2>
          
          <div style={{
            background: "#8B4513",
            color: "#FFF",
            padding: "20px",
            borderRadius: "12px",
            marginBottom: "20px",
            boxShadow: "0 4px 8px rgba(0,0,0,0.3)"
          }}>
            <p style={{ fontSize: "clamp(12px, 3vw, 14px)", marginBottom: "10px", opacity: 0.9 }}>Room Code:</p>
            <p style={{ 
              fontSize: "clamp(28px, 7vw, 36px)", 
              fontWeight: "bold", 
              letterSpacing: "4px",
              margin: "10px 0",
              wordBreak: "break-all"
            }}>
              {joinCode}
            </p>
            <button
              onClick={copyRoomCode}
              style={{
                padding: "10px 20px",
                fontSize: "clamp(14px, 3.5vw, 16px)",
                fontWeight: "bold",
                borderRadius: "8px",
                border: "none",
                background: "#FFD700",
                color: "#000",
                cursor: "pointer",
                marginTop: "10px",
                transition: "0.2s",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent"
              }}
              onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
              onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
            >
              📋 Copy Code
            </button>
          </div>

          {Object.keys(playersInRoom).length > 0 && (
            <>
              <h3 style={{ color: "#8B4513", marginBottom: "15px", fontSize: "clamp(18px, 4.5vw, 22px)" }}>
                👥 Players ({Object.keys(playersInRoom).length})
              </h3>
              <ul style={{ 
                listStyle: "none", 
                padding: 0,
                fontSize: "clamp(16px, 4vw, 18px)"
              }}>
                {Object.entries(playersInRoom).map(([id, p]) => (
                  <li 
                    key={id}
                    style={{
                      background: id === playerId ? "#90EE90" : "#FFF",
                      padding: "12px",
                      marginBottom: "8px",
                      borderRadius: "8px",
                      border: "2px solid #D2691E",
                      fontWeight: id === playerId ? "bold" : "normal"
                    }}
                  >
                    {p.name} {id === playerId ? "👈 (You)" : ""}
                  </li>
                ))}
              </ul>
              <p style={{ 
                marginTop: "20px", 
                fontSize: "clamp(14px, 3.5vw, 16px)", 
                color: "#6B4C3B",
                fontStyle: "italic" 
              }}>
                {Object.keys(playersInRoom).length < 2 
                  ? "⏳ Waiting for another player to join..."
                  : "🎉 Starting game..."}
              </p>
            </>
          )}
        </div>
      )}

      <div style={{
        marginTop: "20px",
        padding: "15px",
        background: "rgba(139, 69, 19, 0.1)",
        borderRadius: "12px",
        maxWidth: "600px",
        margin: "20px auto 0"
      }}>
        <h3 style={{ color: "#8B4513", marginBottom: "15px", fontSize: "clamp(18px, 4.5vw, 22px)" }}>📖 How to Play</h3>
        <ul style={{ 
          textAlign: "left", 
          fontSize: "clamp(12px, 3vw, 14px)", 
          color: "#6B4C3B",
          lineHeight: "1.6",
          paddingLeft: "20px"
        }}>
          <li>🎯 Throw a stone, pick up the required amount, and catch it</li>
          <li>📈 Progress through levels 1 → 2 → 3 → 4</li>
          <li>🏆 First to complete Level 4 wins!</li>
          <li>💥 Use interrupts to sabotage your opponent:</li>
          <li style={{ marginLeft: "15px" }}>🌋 <strong>Earthquake</strong> - Scrambles all stones</li>
          <li style={{ marginLeft: "15px" }}>✨ <strong>Teleport</strong> - Moves one random stone</li>
        </ul>
      </div>
    </div>
  );
}
