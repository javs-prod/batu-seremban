import { useState } from "react";
import Lobby from "./components/Lobby";
import GameRoom from "./components/GameRoom";

function App() {
  const [playerName, setPlayerName] = useState("");
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [roomId, setRoomId] = useState("");

  if (!nameConfirmed) {
    return (
      <div style={{ 
        background: "#F3E5AB", 
        color: "#4B3621", 
        minHeight: "100vh", 
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "15px",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}>
        <div style={{
          background: "#FFF8DC",
          padding: "30px 20px",
          borderRadius: "20px",
          maxWidth: "500px",
          width: "100%",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          border: "3px solid #D2691E",
          textAlign: "center"
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
            marginBottom: "30px" 
          }}>
            A chaotic twist on the traditional Malaysian game!
          </p>
          
          <input 
            placeholder="Enter your name" 
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyPress={e => {
              if (e.key === 'Enter' && playerName.trim() !== "") {
                setNameConfirmed(true);
              }
            }}
            style={{
              padding: "15px",
              fontSize: "18px",
              borderRadius: "8px",
              border: "2px solid #D2691E",
              width: "100%",
              textAlign: "center",
              marginBottom: "20px",
              background: "#FFF",
              boxSizing: "border-box"
            }}
          />
          
          <button 
            onClick={() => {
              if (playerName.trim() !== "") setNameConfirmed(true);
            }}
            style={{
              padding: "15px 40px",
              fontSize: "20px",
              fontWeight: "bold",
              borderRadius: "12px",
              border: "none",
              background: "#228B22",
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              transition: "0.2s",
              width: "100%"
            }}
            onMouseEnter={(e) => e.target.style.transform = "scale(1.05)"}
            onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
          >
            ✨ Let's Play!
          </button>

          <div style={{
            marginTop: "30px",
            padding: "15px",
            background: "rgba(139, 69, 19, 0.1)",
            borderRadius: "8px",
            fontSize: "clamp(12px, 3vw, 14px)",
            color: "#6B4C3B",
            textAlign: "left"
          }}>
            <p><strong>🎮 Quick Start:</strong></p>
            <p style={{ marginTop: "8px" }}>1. Enter your name</p>
            <p>2. Create or join a room</p>
            <p>3. Wait for another player</p>
            <p>4. Play and have fun! 🎉</p>
          </div>
        </div>
      </div>
    );
  }

  if (!roomId) {
    return <Lobby playerName={playerName} setRoomId={setRoomId} />;
  }

  return <GameRoom playerName={playerName} roomId={roomId} />;
}

export default App;
