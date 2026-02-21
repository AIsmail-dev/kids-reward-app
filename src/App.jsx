import React from "react"
import {BrowserRouter,Routes,Route} from "react-router-dom"
import KidDashboard from "./pages/KidDashboard.jsx"
import ParentDashboard from "./pages/ParentDashboard.jsx"

function App(){
return(
<BrowserRouter>
<Routes>
<Route path="/" element={<KidDashboard/>}/>
<Route path="/parent" element={<ParentDashboard/>}/>
</Routes>
</BrowserRouter>
)
}

export default App
