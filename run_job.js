async function run() {
    try {
        const res = await fetch('https://tvsznlwyvamovdxlpzuc.supabase.co/functions/v1/generateTasks', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2c3pubHd5dmFtb3ZkeGxwenVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU3ODUyMCwiZXhwIjoyMDg3MTU0NTIwfQ.yjR9m8NZuTNzwPqJPT6XG9J9-M2WYzxBTbWcBwnDIuk',
                'Content-Type': 'application/json'
            }
        });

        console.log("Status Code:", res.status);
        const text = await res.text();
        console.log("Response:", text);
    } catch (err) {
        console.error("Error executing fetch:", err);
    }
}

run();
