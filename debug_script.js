const http = require('http');

http.get('http://127.0.0.1:8080/webgl-liquid-glass-example.html', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("HTML loaded fine. First 100 chars:", data.substring(0, 100));
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
