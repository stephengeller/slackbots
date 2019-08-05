const AWS = require("aws-sdk");
require("dotenv").config();

AWS.config.update({ region: "eu-west-2" });

const docClient = new AWS.DynamoDB.DocumentClient();

let params = { TableName: process.env.DYNAMODB_TABLE };

// An access token (from your Slack app or custom integration - xoxp, xoxb)

const processVotes = items => {
  const goodVotesCount = items.filter(item => item.vote === "good").length;
  const badVotesCount = items.filter(item => item.vote === "bad").length;
  return `:simple_smile: *${goodVotesCount}*\n:frowning: *${badVotesCount}*`;
};

function jsonResponse(channel, { text }) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      channel,
      text,
      response_type: "in_channel"
    })
  };
}

const addVote = async (user_id, vote) => {
  params["Item"] = {
    event: new Date().toISOString(),
    vote,
    votedBy: user_id
  };
  await docClient
    .put(params)
    .promise()
    .catch(err => console.log(err));
};

const handler = async event => {
  const { body } = event;
  const parsed = new URLSearchParams(body);
  const channel = parsed.get("channel_id");
  const user_id = parsed.get("user_id");
  const command = parsed.get("command");

  if (command === "/goodbot") {
    await addVote(user_id, "good");
    const text = `:aw_yeah:\n`;
    return jsonResponse(channel, { text });
  } else if (command === "/badbot") {
    await addVote(user_id, "bad");
    const text = `:demonplop:\n`;
    return jsonResponse(channel, { text });
  }

  return docClient
    .scan(params)
    .promise()
    .then(async data => {
      const text = processVotes(data.Items);
      return jsonResponse(channel, { text });
    })
    .catch(err => {
      console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
      return jsonResponse(channel, {
        text: `ERROR: ${err.toString()}`
      });
    });
};

module.exports = { handler };
