import React, { useEffect, useState } from "react"
import { Outlet, useNavigate, useLocation } from "react-router-dom"
import './admin.css'
import { FiList, FiLogOut, FiSettings, FiMenu, FiX } from "react-icons/fi"

export default function AdminLayout() {
    const nav = useNavigate()
    const loc = useLocation()
    const [menuOpen, setMenuOpen] = useState(false)

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
            <aside className={`admin-sidebar ${menuOpen ? 'open' : 'closed'}`}>
                <h2 className="admin-desktop-title">Admin Portal</h2>

                <div
                    className={`admin-nav-item ${loc.pathname === '/admin' ? 'active' : ''}`}
                    onClick={() => { nav('/admin'); setMenuOpen(false); }}
                >
                    <FiList size={20} />
                    <span>Manage Tasks</span>
                </div>

                <div
                    className={`admin-nav-item ${loc.pathname === '/admin/occurrences' ? 'active' : ''}`}
                    onClick={() => { nav('/admin/occurrences'); setMenuOpen(false); }}
                >
                    <FiList size={20} />
                    <span>Occurrences (History/Approval)</span>
                </div>

                <div
                    className={`admin-nav-item ${loc.pathname === '/admin/kids' ? 'active' : ''}`}
                    onClick={() => { nav('/admin/kids'); setMenuOpen(false); }}
                >
                    <FiSettings size={20} />
                    <span>Kids (Exceptions)</span>
                </div>

                <div
                    className={`admin-nav-item ${loc.pathname === '/admin/settings' ? 'active' : ''}`}
                    onClick={() => { nav('/admin/settings'); setMenuOpen(false); }}
                >
                    <FiSettings size={20} />
                    <span>Settings</span>
                </div>

                <div className="admin-logout-wrap">
                    <div className="admin-nav-item" onClick={handleLogout} style={{ color: '#ef4444' }}>
                        <FiLogOut size={20} />
                        <span>Logout</span>
                    </div>
                </div>
            </aside>

            <div className={`admin-main-wrapper ${menuOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
                <div className="admin-topbar-mobile">
                    <button className="admin-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
                        {menuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
                    </button>
                    {/* Make the Portal title visible here specifically when mobile */}
                    <h2 className="admin-mobile-title" style={{ margin: 0, fontSize: '1.2rem' }}>Admin Portal</h2>
                </div>

                <main className="admin-content">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
