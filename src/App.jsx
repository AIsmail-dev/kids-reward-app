import React from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import Splash from "./pages/Splash"
import KidDashboard from "./pages/KidDashboard"
import ParentDashboard from "./pages/ParentDashboard"
import Login from "./pages/Login"

import AdminLayout from "./admin/AdminLayout"
import AdminTasks from "./admin/AdminTasks"
import AdminSettings from "./admin/AdminSettings"

function App() {
    return (
        <BrowserRouter>
            <Routes>

                <Route path="/" element={<Splash />} />
                <Route path="/login" element={<Login />} />
                <Route path="/kid" element={<KidDashboard />} />
                <Route path="/parent" element={<ParentDashboard />} />

                <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminTasks />} />
                    <Route path="settings" element={<AdminSettings />} />
                </Route>

            </Routes>
        </BrowserRouter>
    )
}

export default App
