let dummyData = require("./dummyData");
const { handler } = require("./src");

handler(dummyData).then(res => console.log(res));
