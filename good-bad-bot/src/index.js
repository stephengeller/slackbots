const AWS = require("aws-sdk");
require("dotenv").config();

const { DYNAMODB_TABLE } = process.env;

AWS.config.update({ region: "eu-west-2" });

const docClient = new AWS.DynamoDB.DocumentClient();

let params = { TableName: DYNAMODB_TABLE };

const processVotes = items => {
  const goodVotesCount = items.filter(item => item.vote === "good").length;
  const badVotesCount = items.filter(item => item.vote === "bad").length;
  return `:simple_smile: *${goodVotesCount}*\n:frowning: *${badVotesCount}*`;
};

function jsonResponse(channel, text) {
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

  try {
    if (command === "/goodbot") {
      await addVote(user_id, "good");
      const text = ":aw_yeah:";
      return jsonResponse(channel, text);
    } else if (command === "/badbot") {
      await addVote(user_id, "bad");
      const text = ":demonplop:";
      return jsonResponse(channel, text);
    } else if (command === "/judgebot") {
      return await docClient
        .scan(params)
        .promise()
        .then(async data => {
          const text = await processVotes(data.Items);
          return jsonResponse(channel, text);
        })
        .catch(err => {
          return jsonResponse(channel, `DB SCAN ERROR: ${err.toString()}`);
        });
    } else {
      return jsonResponse(channel, "bad slash command, check your naming");
    }
  } catch (err) {
    return jsonResponse(channel, err.toString());
  }
};

module.exports = { handler };
