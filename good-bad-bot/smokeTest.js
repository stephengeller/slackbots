const goodBot = require("./dummyData");
const { handler } = require("./src");

handler(goodBot).then(res => console.log(res.body));
