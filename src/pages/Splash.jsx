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
            <picture style={{ width: "100%", height: "100%", borderRadius: "inherit", overflow: "hidden" }}>
                {/* iPhone 14 Pro Max / 15 Pro Max */}
                <source media="(device-width: 430px) and (device-height: 932px)" srcSet="/splash-430x932.png" />
                {/* iPhone 12/13/14 Pro Max */}
                <source media="(device-width: 428px) and (device-height: 926px)" srcSet="/splash-428x926.png" />
                {/* iPhone XR/11/11 Pro Max */}
                <source media="(device-width: 414px) and (device-height: 896px)" srcSet="/splash-414x896.png" />
                {/* iPhone 12/13/14 Pro */}
                <source media="(device-width: 390px) and (device-height: 844px)" srcSet="/splash-390x844.png" />
                {/* iPhone X/XS/11 Pro */}
                <source media="(device-width: 375px) and (device-height: 812px)" srcSet="/splash-375x812.png" />
                {/* Android Large e.g., Pixel */}
                <source media="(min-width: 400px)" srcSet="/splash-412x915.png" />
                {/* Android Default/Small */}
                <source media="(max-width: 399px)" srcSet="/splash-360x800.png" />

                {/* Fallback */}
                <img
                    src="/splash-390x844.png"
                    alt="Kids Reward App"
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "fill",
                        borderRadius: "inherit"
                    }}
                />
            </picture>
        </div>
    );
}
