import { useState } from "react";
import Lobby from "./components/Lobby";
import GameRoom from "./components/GameRoom";

function App() {
  const [playerName, setPlayerName] = useState("");
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [roomId, setRoomId] = useState("");

  if (!nameConfirmed) {
    return (
      <div style={{ padding: "40px", fontSize: "24px" }}>
        <h1>Batu Seremban</h1>
        <input 
          placeholder="Enter your name" 
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
        />
        <button 
          style={{ marginLeft: "10px" }}
          onClick={() => {
            if (playerName.trim() !== "") setNameConfirmed(true);
          }}
        >
          Continue
        </button>
      </div>
    );
  }

  if (!roomId) {
    return <Lobby playerName={playerName} setRoomId={setRoomId} />;
  }

  return <GameRoom playerName={playerName} roomId={roomId} />;
}

export default App;
