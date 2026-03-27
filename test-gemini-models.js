const apiKey = "AIzaSyAVxwf_4EtLu_0BRuU7nO6SvXRinQAQlgQ";
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function test() {
    const res = await fetch(url);
    const text = await res.text();
    console.log(text);
}
test();
