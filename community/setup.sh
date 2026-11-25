#!/bin/bash
# 소통 공간 서버 설치 (AWS CloudShell에서 실행 · 2775 계정 · 시드니)
#   DynamoDB 표 + Cognito 회원 관리 + Lambda API(함수 URL)를 만든다.
#   여러 번 실행해도 이미 있는 것은 건너뛰고, Lambda 코드는 최신으로 바꾼다.
set -u
export AWS_DEFAULT_REGION=ap-southeast-2
NAME=hibridge-community
BRANCH=${BRANCH:-develop}
CODE_URL="https://raw.githubusercontent.com/narcisse1117/hibridge-100days/$BRANCH/community/lambda/index.mjs"
ORIGINS='["https://main.d1urndoddsyfrn.amplifyapp.com","https://narcisse1117.github.io","http://localhost:8765"]'
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "▶ 계정 $ACCOUNT · 지역 $AWS_DEFAULT_REGION"

# 1) DynamoDB 표
if ! aws dynamodb describe-table --table-name $NAME >/dev/null 2>&1; then
  aws dynamodb create-table --table-name $NAME \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST >/dev/null && echo "✓ DynamoDB 표 만듦"
  aws dynamodb wait table-exists --table-name $NAME
else echo "· DynamoDB 표 있음"; fi
TABLE_ARN=$(aws dynamodb describe-table --table-name $NAME --query Table.TableArn --output text)

# 2) Cognito 회원 관리 (이메일로 가입 · 인증 코드)
POOL=$(aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='$NAME'].Id | [0]" --output text)
if [ "$POOL" = "None" ] || [ -z "$POOL" ]; then
  POOL=$(aws cognito-idp create-user-pool --pool-name $NAME \
    --username-attributes email --auto-verified-attributes email \
    --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":false,"RequireLowercase":false,"RequireNumbers":true,"RequireSymbols":false}}' \
    --account-recovery-setting '{"RecoveryMechanisms":[{"Priority":1,"Name":"verified_email"}]}' \
    --verification-message-template '{"DefaultEmailOption":"CONFIRM_WITH_CODE","EmailSubject":"[신입 100일 생존기] 인증 코드","EmailMessage":"신입 100일 생존기 인증 코드는 {####} 입니다."}' \
    --query UserPool.Id --output text) && echo "✓ Cognito 만듦: $POOL"
else echo "· Cognito 있음: $POOL"; fi
CLIENT=$(aws cognito-idp list-user-pool-clients --user-pool-id $POOL --query "UserPoolClients[?ClientName=='web'].ClientId | [0]" --output text)
if [ "$CLIENT" = "None" ] || [ -z "$CLIENT" ]; then
  CLIENT=$(aws cognito-idp create-user-pool-client --user-pool-id $POOL --client-name web --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --prevent-user-existence-errors ENABLED --refresh-token-validity 30 \
    --query UserPoolClient.ClientId --output text) && echo "✓ 앱 클라이언트 만듦"
fi

# 3) Lambda 실행 역할 (로그 + 이 표만 읽고 쓰기)
ROLE=$NAME-role
if ! aws iam get-role --role-name $ROLE >/dev/null 2>&1; then
  aws iam create-role --role-name $ROLE --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "✓ 실행 역할 만듦 (10초 기다림)"; sleep 10
fi
aws iam put-role-policy --role-name $ROLE --policy-name table --policy-document \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"dynamodb:GetItem\",\"dynamodb:PutItem\",\"dynamodb:UpdateItem\",\"dynamodb:DeleteItem\",\"dynamodb:Query\",\"dynamodb:BatchGetItem\"],\"Resource\":\"$TABLE_ARN\"}]}"
ROLE_ARN=$(aws iam get-role --role-name $ROLE --query Role.Arn --output text)

# 4) Lambda 함수 (코드는 GitHub에서 받음)
rm -rf /tmp/$NAME && mkdir -p /tmp/$NAME && cd /tmp/$NAME
curl -fsSL "$CODE_URL" -o index.mjs || { echo "✗ 코드를 받지 못했어요: $CODE_URL"; exit 1; }
zip -q fn.zip index.mjs
# HRD 담당자 가입용 인증 코드 (이미 있으면 그대로 둠)
HRD_CODE=$(aws lambda get-function-configuration --function-name $NAME --query Environment.Variables.HRD_CODE --output text 2>/dev/null)
if [ -z "$HRD_CODE" ] || [ "$HRD_CODE" = "None" ]; then HRD_CODE=$(printf "%06d" $((RANDOM * RANDOM % 1000000))); fi
ENV="Variables={TABLE=$NAME,USER_POOL_ID=$POOL,CLIENT_ID=$CLIENT,HRD_CODE=$HRD_CODE}"
if aws lambda get-function --function-name $NAME >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $NAME --zip-file fileb://fn.zip >/dev/null && echo "✓ Lambda 코드 갱신"
  aws lambda wait function-updated --function-name $NAME
  aws lambda update-function-configuration --function-name $NAME --environment "$ENV" >/dev/null
else
  for i in 1 2 3 4 5; do
    aws lambda create-function --function-name $NAME --runtime nodejs22.x --handler index.handler \
      --role $ROLE_ARN --zip-file fileb://fn.zip --timeout 10 --memory-size 256 --environment "$ENV" >/dev/null 2>/tmp/$NAME/err \
      && { echo "✓ Lambda 만듦"; break; }
    echo "  (역할 준비 중… 다시 시도 $i)"; sleep 8
  done
  aws lambda wait function-active-v2 --function-name $NAME
fi

# 5) 함수 URL (로그인 토큰은 Lambda 안에서 확인)
if ! aws lambda get-function-url-config --function-name $NAME >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name $NAME --auth-type NONE \
    --cors "{\"AllowOrigins\":$ORIGINS,\"AllowMethods\":[\"POST\"],\"AllowHeaders\":[\"content-type\",\"authorization\"],\"MaxAge\":3600}" >/dev/null
  aws lambda add-permission --function-name $NAME --statement-id url --action lambda:InvokeFunctionUrl \
    --principal '*' --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --function-name $NAME --statement-id url-invoke --action lambda:InvokeFunction \
    --principal '*' --invoked-via-function-url >/dev/null 2>&1 || true
  echo "✓ 함수 URL 만듦"
fi
URL=$(aws lambda get-function-url-config --function-name $NAME --query FunctionUrl --output text)

echo ""
echo "================ 아래 세 줄을 복사해서 Claude에게 보내 주세요 ================"
echo "POOL=$POOL"
echo "CLIENT=$CLIENT"
echo "URL=$URL"
echo "HRD_CODE=$HRD_CODE   (HRD 담당자로 가입할 때 넣는 코드 · 팀원에게만 알려 주세요)"
echo "=========================================================================="
