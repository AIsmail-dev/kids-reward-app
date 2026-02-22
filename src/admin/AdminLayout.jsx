import React, { useEffect } from "react"
import { Outlet, useNavigate, useLocation } from "react-router-dom"
import './admin.css'
import { FiList, FiLogOut, FiSettings } from "react-icons/fi"

export default function AdminLayout() {
    const nav = useNavigate()
    const loc = useLocation()

    useEffect(() => {
        const userStr = localStorage.getItem("user")
        if (!userStr) {
            nav("/login")
            return
        }

        const user = JSON.parse(userStr)
        if (user.role !== 'parent') {
            nav("/")
        }
    }, [nav])

    const handleLogout = () => {
        localStorage.removeItem("user")
        nav("/login")
    }

    return (
        <div className="admin-container">
            <aside className="admin-sidebar">
                <h2>Admin Portal</h2>

                <div
                    className={`admin-nav-item ${loc.pathname === '/admin' ? 'active' : ''}`}
                    onClick={() => nav('/admin')}
                >
                    <FiList size={20} />
                    <span>Manage Tasks</span>
                </div>

                <div
                    className={`admin-nav-item ${loc.pathname === '/admin/settings' ? 'active' : ''}`}
                    onClick={() => nav('/admin/settings')}
                >
                    <FiSettings size={20} />
                    <span>Settings</span>
                </div>

                <div style={{ marginTop: 'auto' }}>
                    <div className="admin-nav-item" onClick={handleLogout} style={{ color: '#ef4444' }}>
                        <FiLogOut size={20} />
                        <span>Logout</span>
                    </div>
                </div>
            </aside>

            <main className="admin-content">
                <Outlet />
            </main>
        </div>
    )
}
