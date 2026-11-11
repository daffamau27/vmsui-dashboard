def telegramNotify(String status, String message) {
    withCredentials([
        string(credentialsId: 'telegram-bot-token', variable: 'TG_BOT_TOKEN'),
        string(credentialsId: 'telegram-chat-id', variable: 'TG_CHAT_ID')
    ]) {
        withEnv([
            "TG_STATUS=${status}",
            "TG_MESSAGE=${message}"
        ]) {
            def result = sh(
                returnStatus: true,
                script: '''
                    MESSAGE="$(printf 'VMSUI FRONTEND - %s\\n\\n%s' \
                        "$TG_STATUS" "$TG_MESSAGE")"

                    curl -fsS --max-time 10 \
                        -X POST \
                        "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
                        --data-urlencode "chat_id=${TG_CHAT_ID}" \
                        --data-urlencode "text=${MESSAGE}" \
                        > /dev/null
                '''
            )

            if (result != 0) {
                echo "WARNING: Telegram notification failed. Pipeline continues."
            }
        }
    }
}

pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        REGISTRY_HOST = 'devvmsmap.semar.biz.id'
        IMAGE_NAME = 'vmsui-frontend'

        PROD_USER = 'ptsadmin'
        PROD_HOST = '100.74.27.30'

        DEPLOY_SCRIPT = '/DATA/AppData/vmsui-deploy/deploy.sh'
    }

    stages {

        stage('Initialize') {
            steps {
                script {
                    def rawBranch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'main'
                    env.SOURCE_BRANCH = rawBranch
                        .replaceFirst('^refs/remotes/origin/', '')
                        .replaceFirst('^refs/heads/', '')
                        .replaceFirst('^origin/', '')

                    env.SHORT_SHA = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()

                    env.IMAGE_TAGS = "latest production-latest prod-${env.SHORT_SHA}"
                    env.DEPLOY_TARGET = 'production'

                    telegramNotify(
                        '🚀 STARTED',
                        """Branch: ${env.SOURCE_BRANCH}
Commit: ${env.SHORT_SHA}
Build: #${env.BUILD_NUMBER}
Target: ${env.DEPLOY_TARGET}"""
                    )
                }
            }
        }

        stage('Build & Push') {
            steps {
                script {
                    def buildArgs = env.IMAGE_TAGS.tokenize(' ')
                        .collect { "-t ${env.REGISTRY_HOST}/${env.IMAGE_NAME}:${it}" }
                        .join(' ')

                    sh """
                        docker build \
                            -f Dockerfile \
                            ${buildArgs} \
                            .
                    """
                }

                withCredentials([
                    usernamePassword(
                        credentialsId: 'docker-registry',
                        usernameVariable: 'REGISTRY_USER',
                        passwordVariable: 'REGISTRY_PASS'
                    )
                ]) {
                    sh '''
                        echo "$REGISTRY_PASS" | docker login "$REGISTRY_HOST" \
                            -u "$REGISTRY_USER" \
                            --password-stdin
                    '''

                    script {
                        env.IMAGE_TAGS.tokenize(' ').each { tag ->
                            sh "docker push ${env.REGISTRY_HOST}/${env.IMAGE_NAME}:${tag}"
                        }
                    }
                }
            }
        }

        stage('Deploy Production') {
            steps {
                sshagent(credentials: ['production-ssh']) {
                    sh '''
                        ssh \
                            -o BatchMode=yes \
                            -o ConnectTimeout=15 \
                            -o StrictHostKeyChecking=yes \
                            "${PROD_USER}@${PROD_HOST}" \
                            "sudo -n ${DEPLOY_SCRIPT} frontend"
                    '''
                }
            }
        }
    }

    post {
        success {
            script {
                telegramNotify(
                    '✅ SUCCESS',
                    """Branch: ${env.SOURCE_BRANCH}
Commit: ${env.SHORT_SHA}
Build: #${env.BUILD_NUMBER}
Tags: ${env.IMAGE_TAGS}
✅ Deployed to ZimaOS"""
                )
            }
        }

        failure {
            script {
                telegramNotify(
                    '❌ FAILED',
                    """Branch: ${env.SOURCE_BRANCH}
Commit: ${env.SHORT_SHA}
Build: #${env.BUILD_NUMBER}

Check Jenkins console for details."""
                )
            }
        }

        aborted {
            script {
                telegramNotify(
                    '⚠️ ABORTED',
                    """Branch: ${env.SOURCE_BRANCH}
Build: #${env.BUILD_NUMBER}"""
                )
            }
        }

        always {
            sh 'docker logout "$REGISTRY_HOST" || true'
        }
    }
}