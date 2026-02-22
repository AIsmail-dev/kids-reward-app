const webpush = require("web-push");
const response = webpush.generateVAPIDKeys();
console.log(JSON.stringify(response));
