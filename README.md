# Slackbot Megarepo

# How to use

All file creations / actions are assumed to be in the subdirectory of the bot you want to use.
Both slackbots will need a `.env` file within their respective directories, for configuration.

### Prep:

* Ensure you have your `awscli` set up properly, and configured with access credentials that allow you to modify lambdas.

### `GoodBadBot`

1. Create a `.env` file in the directory
2. Create an AWS DynamoDB table and keep note of the name.
3. Create an AWS Lambda function in the same region, to be used to execute the commands. Choose NodeJS as the language.
4. Fill in the `.env` file like so:
```dotenv
FUNCTION_NAME="" # Add the name of the lambda function here, should start with "arn:..."
REGION="" # Add region where the lambda / table exists
DYNAMODB_TABLE="" # Add the name of the DynamoDB table
```
5. Run `./deploy.sh` and see what happens!

### `MinecraftSlackbot`

#### Notes:

* For this to work ensure you have `enable-query=true` in your vanilla Minecraft `server.properties` file, 
and that the server is publicly accessible through a public IP.

1. Create a `.env` file in the directory
2. Create an AWS Lambda function, to be used to execute the commands. Choose NodeJS as the language.
3. Fill in the `.env` file like so:
```dotenv
FUNCTION_NAME="" # Add the name of the lambda function here, should start with "arn:..."
REGION="" # Add region where the lambda exists
INSTANCE_IP="" # Add the public IP of the minecraft server you want to query

SERVER_INSTANCE_ID="" # Add the instance ID of the EC2 instance running the server
```
4. Run `./deploy.sh` and see what happens!


# TODO:
* Add Slackbot config instructions