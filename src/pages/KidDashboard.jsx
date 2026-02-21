import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function KidDashboard(){

const [tasks,setTasks] = useState([])
const [balance,setBalance] = useState(0)

const kidId = "11111111-1111-1111-1111-111111111111"

useEffect(()=>{
fetchTasks()
fetchBalance()
},[])

async function fetchTasks(){

const today = new Date().toISOString().split('T')[0]

const {data} = await supabase
.from('task_occurrences')
.select(`
id,
status,
tasks:task_id (
title,
reward
)
`)
.eq('kid_id',kidId)
.eq('scheduled_date',today)

setTasks(data)
}

async function fetchBalance(){

const {data} = await supabase
.from('wallet_transactions')
.select('amount')
.eq('kid_id',kidId)

let total = 0
data?.forEach(t => total += t.amount)

setBalance(total)
}

async function completeTask(id){

await supabase
.from('task_occurrences')
.update({status:'completed'})
.eq('id',id)

fetchTasks()
fetchBalance()
}
async function requestWithdrawal(method){

const amount = prompt("Enter amount")

await supabase
.from('withdrawals')
.insert({
kid_id:kidId,
amount:parseInt(amount),
method:method
})

alert("Request Sent!")
}


return(
<div>

<h2>Today's Tasks</h2>
<h3>Balance: ${balance}</h3>
<h3>Withdraw</h3>

<button onClick={()=>requestWithdrawal('cash')}>
Cash
</button>

<button onClick={()=>requestWithdrawal('school')}>
School Card
</button>

<button onClick={()=>requestWithdrawal('bank')}>
Bank Transfer
</button>


{tasks?.map(t=>(
<div key={t.id}>
<p>{t.tasks?.title}</p>
<p>${t.tasks?.reward}</p>

{t.status === 'pending' &&
<button onClick={()=>completeTask(t.id)}>
Complete
</button>
}

</div>
))}

</div>
)
}
