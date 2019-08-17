#!/usr/bin/env bash

set -euo pipefail

BOT=$1
FORCE=${2:-"no"}
ENV_FILE=.env.prod

CURRENT_DIR=$(dirname $0)

cd "${CURRENT_DIR}/${BOT}"

source ${ENV_FILE}

RED="\033[31m"
GREEN="\033[32m"
BOLD="\033[1m"
NC="\033[0m"

SRC_DIR=src
PACKAGE_DIR=package # Directory to bundle everything up


ZIPPED_PACKAGE=${FUNCTION_NAME}.zip # So that we can use it later
PROFILE="${3:-default}" # Use "default" if you don't have fancy configuration in your ~/.aws/credentials

if [[ -z ${FUNCTION_NAME} ||  -z ${REGION} ||  -z ${PROFILE} ]]; then
    echo -e "${RED}Error! Missing config in deploy_to_aws.sh"
    echo -e "Make sure you pass FUNCTION_NAME, REGION and PROFILE variables."
    echo -e "${BOLD}e.g. ${0} some_function eu-west-1 some_user1${NC}"
    exit 1
fi


function lint_files() {
    eslint ${SRC_DIR}/
}

# Install dependencies from requirements.txt
function install_dependencies() {
    mkdir ${PACKAGE_DIR}
    cp package.json ${PACKAGE_DIR}/
    npm install --prefix ${PACKAGE_DIR}
}

# Copy source files into directory, and zip it up
function zip_files() {
    cp ${SRC_DIR}/* ${PACKAGE_DIR}/
    cp ${ENV_FILE} ${PACKAGE_DIR}/.env
    cd ${PACKAGE_DIR}
    echo -e "\n${BOLD}Zipping up...${NC}"
    zip -r ../${ZIPPED_PACKAGE} * .*
    cd - &>/dev/null
}

# Upload the zipped directory straight to the AWS Lambda,
function upload_to_aws() {
    echo -e "\n${BOLD}Uploading to AWS Lambda...${NC}"
    aws lambda update-function-code --profile ${PROFILE} --publish --region ${REGION} --function-name ${FUNCTION_NAME} --zip-file fileb://${ZIPPED_PACKAGE}
    EXIT_CODE=$?
    if [[ ${EXIT_CODE} -ne 0 ]]; then
        echo -e "\n***${RED} Failed to upload to AWS Lambda ${NC}***"
    fi

    cleanup
    echo -e "${GREEN}Done. ${NC}"
}

# Remove generated directory and zipped package
function cleanup() {
    rm -rf ${ZIPPED_PACKAGE}
    rm -rf ${PACKAGE_DIR}
}

if [[ ${FORCE} != "force" ]]; then
	lint_files
fi

cleanup
install_dependencies
zip_files
upload_to_aws

cd ../
