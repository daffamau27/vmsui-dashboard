pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        REGISTRY_HOST = '100.71.227.115:5000'
        IMAGE_NAME = 'vmsui-frontend'
        GIT_BRANCH = 'main'
    }

    stages {
        stage('Build') {
            steps {
                script {
                    def shortSha = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()

                    if (env.GIT_BRANCH in ['main', 'master']) {
                        env.IMAGE_TAGS = "latest production-latest prod-${shortSha}"
                    } else {
                        env.IMAGE_TAGS = "staging-latest staging-${shortSha}"
                    }

                    def buildArgs = env.IMAGE_TAGS.tokenize(' ')
                        .collect {
                            "-t ${env.REGISTRY_HOST}/${env.IMAGE_NAME}:${it}"
                        }
                        .join(' ')

                    sh "docker build -f Dockerfile ${buildArgs} ."
                }
            }
        }

        stage('Push') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'docker-registry',
                        usernameVariable: 'REGISTRY_USER',
                        passwordVariable: 'REGISTRY_PASS'
                    )
                ]) {
                    script {
                        sh '''
                            echo "$REGISTRY_PASS" | docker login "$REGISTRY_HOST" \
                                -u "$REGISTRY_USER" \
                                --password-stdin
                        '''

                        env.IMAGE_TAGS.tokenize(' ').each { tag ->
                            sh """
                                docker push ${env.REGISTRY_HOST}/${env.IMAGE_NAME}:${tag}
                            """
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            sh 'docker logout "$REGISTRY_HOST" || true'
        }
    }
}