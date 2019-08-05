# Slackbot Megarepo

# How to use

All file creations / actions are assumed to be in the subdirectory of the bot you want to use.
Both slackbots will need a `.env` file within their respective directories, for configuration.

## `GoodBadBot`

1. Create a .env file in the directory
2. Create an AWS DynamoDB table and keep note of the name.
3. Create an AWS Lambda function in the same region, to be used to execute the commands. Choose NodeJS as the language.
3. Fill in the .env file like so:
```dotenv
FUNCTION_NAME="" # Add the name of the lambda function here, should start with "arn:..."
REGION="" # Add region where the lambda / table exists
DYNAMODB_TABLE="" # Add the name of the DynamoDB table
```
4. Run ./deploy.sh and see what happens!