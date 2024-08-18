# Use an official Node.js runtime as the base image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy the application files to the container
COPY . .

# List the contents of the /app directory for debugging (optional, can be removed after debugging)
RUN ls -la /app

# Install the project dependencies
RUN yarn install

# Build the application
RUN yarn build

# Command to run your application
CMD ["yarn", "ts-node", "./src/crank.ts"]
