import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const rpcs = ['generateTasks', 'generate_tasks', 'generatetasks'];
    for (const rpc of rpcs) {
        console.log(`--> Triggering RPC: ${rpc}`)
        let res = await supabase.rpc(rpc)
        if (res.error && res.error.code !== 'PGRST202') {
            console.log(`SUCCESS or OTHER ERROR for ${rpc}:`, res)
        } else if (!res.error) {
            console.log(`SUCCESS for ${rpc}:`, res)
        } else {
            console.log(`Not Found: ${rpc}`)
        }
    }

    const edgeFunctions = ['generateTasks', 'generate-tasks', 'generatetasks'];
    for (const func of edgeFunctions) {
        console.log(`--> Triggering Edge Function: ${func}`)
        const { data, error } = await supabase.functions.invoke(func)
        if (error && error.name === 'FunctionsHttpError') {
            console.log(`Not Found: ${func}`)
        } else {
            console.log(`SUCCESS or OTHER ERROR for ${func}:`, { data, error })
        }
    }
}

run()
