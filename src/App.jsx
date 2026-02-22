import React from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import Splash from "./pages/Splash"
import KidDashboard from "./pages/KidDashboard"
import ParentDashboard from "./pages/ParentDashboard"
import Login from "./pages/Login"

function App() {
    return (
        <BrowserRouter>
            <Routes>

                <Route path="/" element={<Splash />} />
                <Route path="/login" element={<Login />} />
                <Route path="/kid" element={<KidDashboard />} />
                <Route path="/parent" element={<ParentDashboard />} />

            </Routes>
        </BrowserRouter>
    )
}

export default App
