# pull official base image 
FROM node:16-alpine as build

# set working directory 
WORKDIR /app

RUN apk update
RUN apk add git
RUN git clone https://atharva-borekar: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@github.com/atharva-borekar/react-deploy.git

WORKDIR /app/react-deploy
RUN npm install --production
RUN npm run build

CMD ["npm", "run", "start"]
