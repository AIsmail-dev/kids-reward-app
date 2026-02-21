import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function ParentDashboard(){

const [completed,setCompleted] = useState([])
const [withdrawals,setWithdrawals] = useState([])

useEffect(()=>{
fetchCompletedTasks()
fetchWithdrawals()
},[])

async function fetchCompletedTasks(){

const {data} = await supabase
.from('task_occurrences')
.select(`
id,
kid_id,
tasks:task_id (
title,
reward
)
`)
.eq('status','completed')

setCompleted(data)
}

async function fetchWithdrawals(){

const {data} = await supabase
.from('withdrawals')
.select('*')
.eq('status','pending')

setWithdrawals(data)
}

async function approveTask(task){

await supabase
.from('wallet_transactions')
.insert({
kid_id:task.kid_id,
amount:task.tasks.reward,
type:'reward'
})

await supabase
.from('task_occurrences')
.update({status:'approved'})
.eq('id',task.id)

fetchCompletedTasks()
}

async function approveWithdrawal(w){

await supabase
.from('wallet_transactions')
.insert({
kid_id:w.kid_id,
amount:-w.amount,
type:'withdraw'
})

await supabase
.from('withdrawals')
.update({status:'approved'})
.eq('id',w.id)

fetchWithdrawals()
}

return(
<div>

<h2>Completed Tasks</h2>

{completed?.map(t=>(
<div key={t.id}>
<p>{t.tasks?.title}</p>
<p>${t.tasks?.reward}</p>

<button onClick={()=>approveTask(t)}>
Approve
</button>
</div>
))}

<h2>Withdrawal Requests</h2>

{withdrawals?.map(w=>(
<div key={w.id}>
<p>${w.amount}</p>
<p>{w.method}</p>

<button onClick={()=>approveWithdrawal(w)}>
Approve
</button>
</div>
))}

</div>
)
}
