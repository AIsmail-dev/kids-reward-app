import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Splash() {
    const nav = useNavigate();

    useEffect(() => {
        const timer = setTimeout(() => {
            nav('/login');
        }, 2000);
        return () => clearTimeout(timer);
    }, [nav]);

    return (
        <div className="login-container" style={{ backgroundColor: "var(--bg-color)" }}>
            <img
                src="/icon.png"
                alt="Kids Reward App"
                style={{
                    width: "180px",
                    height: "180px",
                    objectFit: "contain",
                    animation: "float 2s ease-in-out infinite",
                    marginBottom: "20px",
                    filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.1))"
                }}
            />
            <h1 className="title" style={{ fontSize: "2.5rem", animation: "pulse 2s infinite" }}>Kids Rewards</h1>
        </div>
    );
}
