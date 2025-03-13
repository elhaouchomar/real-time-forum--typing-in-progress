
export async function apiRequest(url){
    console.log(`Api Request Made to = ${url}`);
    try
    {
        const response = await fetch(`/${url}`, {
            method: "POST",
        })
        const jsReponse = await response.json()
        return jsReponse
        
    }catch(error){
        console.log(`Error Fetch data from http://localhost:8080/${url}`, error)
    }
}