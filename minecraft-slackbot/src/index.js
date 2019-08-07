const AWS = require("aws-sdk");
const axios = require("axios");
require("dotenv").config();

AWS.config.update({ region: "eu-west-2" });

const stephenID = "ULQRZJEK1";
const minecraftChannel = "CLBLVNLE7";
const { INSTANCE_IP, SERVER_INSTANCE_ID } = process.env;
const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });
const params = {
  DryRun: false,
  InstanceIds: [SERVER_INSTANCE_ID]
};

const jsonResponse = (channel, text, response_type = "in_channel") => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      channel,
      text,
      response_type
    })
  };
};

function userIsValid(user) {
  return user === stephenID;
}

const turnOnServer = async user => {
  await ec2
    .startInstances(params)
    .promise()
    .catch(err => err);
  return `<@${user}> turned on the server!`;
};

const turnOffServer = async user => {
  if (userIsValid(user)) {
    await ec2
      .stopInstances(params)
      .promise()
      .catch(err => err);
    return `<@${user}> is stopping the server!`;
  } else {
    return `Ask <@${stephenID}> for access perms :)`;
  }
};
const serverStatus = async () => {
  const ec2Info = await ec2
    .describeInstances(params)
    .promise()
    .then(data => {
      const serverInfo = data.Reservations[0].Instances[0];
      const { State, LaunchTime } = serverInfo;
      const state = State.Name;
      return {
        message: `The EC2 instance is *${state}*\nLast launched at ${LaunchTime}`,
        state
      };
    })
    .catch(err => console.log(err));

  if (ec2Info.state !== "running") {
    return "EC2 instance is off. Run `/minecraft on` to turn it on.\n";
  }

  const url = "https://mcapi.us/server/status?port=25565&ip=" + INSTANCE_IP;
  return await axios.get(url).then(res => {
    let formattedStr;
    const { data } = res;
    if (data.online) {
      formattedStr = "\nServer is *online*!\n";
      formattedStr += `*${data.players.now} players* currently online.\n`;
      return formattedStr;
    } else {
      return (
        `\nEC2 instance is ${
          ec2Info.state
        } but server is not running. Maybe speak to Stephen?\n` +
        ec2Info.message
      );
    }
  });
};

const handler = async event => {
  let msg = "Incorrect arg, try `/minecraft on|off|status`";
  const { body } = event;
  const parsed = new URLSearchParams(body);
  const req_channel = parsed.get("channel_id");
  const user_id = parsed.get("user_id");
  const command = parsed.get("command");
  const text = parsed.get("text");

  try {
    if (command === "/minecraft") {
      if (text === "on" || text === "start") {
        msg = await turnOnServer(user_id);
      } else if (text === "off" || text === "stop") {
        msg = await turnOffServer(user_id);
      } else if (text === "status") {
        msg = await serverStatus();
        return jsonResponse(req_channel, msg, "ephemeral");
      }
    }
  } catch (e) {
    msg = "ERROR: " + e.toString();
  }

  return jsonResponse(minecraftChannel, msg, "in_channel");
};

module.exports = { handler };
