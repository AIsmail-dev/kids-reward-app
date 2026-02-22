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
        <div className="app-wrapper" style={{ backgroundColor: "var(--bg-color)", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <img
                src="/icon.png"
                alt="Kids Reward App"
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "inherit"
                }}
            />
        </div>
    );
}
