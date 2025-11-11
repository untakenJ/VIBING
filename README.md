# VIBING

This is the code repository for the CS 2790R project `VIBING: Visual INtuition-Based Interaction for Natural Generation from Painters & Artists` at Harvard University.

This project is powered by [`Svelte`](https://github.com/sveltejs/svelte).

## Project Report
For detailed information about the project, methodology, and results, please refer to the [Project Report](https://pub-129b2c8482dc4a708130441b9822b989.r2.dev/VIBING.pdf).


## Demo

**Live Demo**: [https://vibing-qk67.onrender.com](https://vibing-qk67.onrender.com)

**Note**: The demo has been beautified and the user interaction experience has been slightly improved by Lingze after the class. However, the core logic and functionality of the original prototype remain unchanged.

**Maintenance**: This live demo is currently maintained by Lingze (GitHub: [@untakenJ](https://github.com/untakenJ)). If the API tokens are exhausted, please contact him.




<!-- ## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
``` -->

## Installation

First, install the dependencies:

```bash
npm install
```

**Note**: The project uses `@sveltejs/adapter-node` for Node.js deployment. If you haven't installed it yet, it will be installed with `npm install`.

## Environment Setup

Before running the application, you need to configure the required API keys.

**⚠️ IMPORTANT SECURITY NOTE:** All API keys are now stored as **server-side environment variables** (without the `VITE_` prefix). This ensures they are never exposed to the client and remain secure. The application uses server-side API routes to proxy all third-party API calls.

1. Copy the example environment file:
   ```bash
   cp env.example .env.local
   ```

2. Edit `.env.local` and fill in your actual API keys:
   - `OPENAI_API_KEY`: Your OpenAI API key (for GPT-4o-mini, used for image description and chat assistant)
   - `IMGBB_API_KEY`: Your ImgBB API key (for image upload)
   - `STABILITY_KEY`: Your Stability AI API key (for image generation)

   **Note:** These variables do NOT have the `VITE_` prefix, which means they are only accessible on the server side and will never be exposed to the client.

   You can obtain these API keys from:
   - OpenAI: https://platform.openai.com/api-keys
   - ImgBB: https://api.imgbb.com/
   - Stability AI: https://platform.stability.ai/

3. Save the `.env.local` file (it will be ignored by git)

## Developing

Once you've installed dependencies with `npm install` , start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building for Production

### Prerequisites

Before building for production, ensure you have configured the environment variables:

1. **For local production build and preview:**
   ```bash
   cp env.production.example .env.production
   ```
   
   Edit `.env.production` and fill in your actual API keys (same as development):
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `IMGBB_API_KEY`: Your ImgBB API key
   - `STABILITY_KEY`: Your Stability AI API key

   **Note:** These are server-side environment variables (no `VITE_` prefix) and will not be exposed to the client.

2. **For deployment platforms** (Vercel, Netlify, Render, etc.):
   - Configure the environment variables in your platform's dashboard/settings
   - The same three variables are required: `OPENAI_API_KEY`, `IMGBB_API_KEY`, `STABILITY_KEY`
   - **Important:** Do NOT use `VITE_` prefix - these are server-side only variables

### Build Commands

1. **Build the production version:**
   ```bash
   npm run build
   ```
   This will create an optimized production build. The output location depends on the adapter:
   - For `adapter-auto`: Typically `.output` directory
   - The build process will optimize your code and create a production-ready version

2. **Preview the production build locally:**
   ```bash
   npm run preview
   ```
   This starts a local server to preview the production build (default port: 4173).

### Deployment

The project uses `@sveltejs/adapter-node` for Node.js deployment, which is suitable for platforms like Render, Railway, or any Node.js hosting environment.

#### Deploying to Render

1. **Create a new Web Service** on Render:
   - Connect your GitHub repository
   - Select "Web Service"

2. **Configure Build & Start Commands**:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: `Node`
   - **Node Version**: `18` or higher (specify in package.json engines field)

3. **⚠️ Important: Set Environment Variables**:
   
   **CRITICAL**: Set these server-side environment variables in Render (they do NOT have the `VITE_` prefix):
   
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `IMGBB_API_KEY`: Your ImgBB API key
   - `STABILITY_KEY`: Your Stability AI API key
   
   **How to set**:
   - Go to your Render service dashboard
   - Navigate to "Environment" section
   - Add all three variables with their values (without `VITE_` prefix)
   - **Save the changes** (this will trigger a rebuild)
   
   **Note**: 
   - `PORT` environment variable is automatically provided by Render - you don't need to set it manually.
   - These are server-side variables and will never be exposed to the client, ensuring your API keys remain secure.

4. **Deploy**: Render will automatically build and deploy your application. The server will listen on the PORT provided by Render.

**Troubleshooting**:
- If build fails, check that all three environment variables (`OPENAI_API_KEY`, `IMGBB_API_KEY`, `STABILITY_KEY`) are set in Render dashboard
- **Important:** Do NOT use `VITE_` prefix - these are server-side only variables
- If the app doesn't start, check the logs for any missing dependencies
- Ensure Node.js version is 18 or higher (configured in package.json engines field)

#### Other Deployment Platforms

- **Vercel/Netlify**: May need to switch back to `@sveltejs/adapter-auto` or use platform-specific adapters
- **Node.js servers**: Current setup with `adapter-node` is ready
- **Static hosting**: Would require switching to `@sveltejs/adapter-static`

**Important**: When deploying to production, make sure to set the environment variables in your hosting platform's environment settings. The required variables are (without `VITE_` prefix):
- `OPENAI_API_KEY`
- `IMGBB_API_KEY`
- `STABILITY_KEY`

These are server-side environment variables that will never be exposed to the client, ensuring your API keys remain secure.

> For more information about adapters, see [SvelteKit adapters documentation](https://svelte.dev/docs/kit/adapters).

## Local Development Demo

Once the service is running with `npm run dev`, you may access the application through the browser. The default port would be `5173`. The final version of our application can be accessed with [http://localhost:5173](http://localhost:5173) and the baseline system is at [http://localhost:5173/vibing_baseline](http://localhost:5173/vibing_baseline).
