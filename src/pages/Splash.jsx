import React from "react";
import { Navigate } from "react-router-dom";

// No splash delay: go straight to the logged-in user's home, or to login if the saved session is
// missing or its token has expired.
export default function Splash() {
    let user = null;
    try {
        const token = localStorage.getItem("token");
        const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (exp * 1000 > Date.now()) user = JSON.parse(localStorage.getItem("user"));
    } catch {
        // No token or an unreadable one: log in again.
    }

    if (!user) return <Navigate to="/login" replace />;
    return <Navigate to={user.role === 'parent' ? '/parent' : '/kid'} replace />;
}
