#!/usr/bin/env bash

set -e

MY_PATH="`dirname \"$0\"`"
FORCE=$1

jest .

ENV=prod ${MY_PATH}/../deploy_to_aws.sh minecraft-slackbot ${FORCE}
