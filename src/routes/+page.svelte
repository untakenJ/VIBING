<script lang="ts">
    import { onMount, onDestroy } from 'svelte';

    let control_image: File | null = null;

    // User input and API response states
    let chatbotInputValue = '';
    let promptInputValue = '';
    let controlImage: File | null = null;
    let initalSketchImage: File | null = null;

    interface ApiResponse {
        category: 'generated' | 'modified' | 'refined'; // Image category
        prompt: string;
        image_url: string;
        timestamp: string; // When the image was created
    }

    // history of generated images
    interface GeneratedImage {
        imageUrl: string;
        timestamp: string; // When the image was created
        prompt: string;
        description: string;
    }
    
    let generatedImages: GeneratedImage[] = [];

    let api_response: ApiResponse | null = null;
    let currentGeneratedImage: GeneratedImage | null = null;
    let error = '';
    let isImageGenLoading = false; // which state?

    // History of prompts and images
    let history: ApiResponse[] = [];

    // References to the canvas and image elements
    let canvas: HTMLCanvasElement;
    let imageElement: HTMLImageElement;

    // Drawing state
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // Brush size state
    let brushSize = 10; // Default brush size

    // Undo stack
    let undoStack: ImageData[] = [];
    const MAX_UNDO = 20; // Maximum number of undo steps

    let globalOptimizedPrompt = "";

    // History collapse state
    let isHistoryExpanded = false;
    
    // Function to handle history item click
    function handleHistoryItemClick(item: GeneratedImage, index: number, event: Event) {
        event.stopPropagation(); // Prevent event bubbling
        const selectedImage = generatedImages[generatedImages.length - index - 1];
        currentGeneratedImage = selectedImage;
        promptInputValue = selectedImage.prompt;
        // Collapse history after selection
        isHistoryExpanded = false;
    }
    
    // Function to handle overlay click (close history)
    function handleOverlayClick() {
        isHistoryExpanded = false;
    }

    let imageFile: File | null = null; // To store the selected file
    let imageUrl = ""; // To store the uploaded image URL
    let imageLoading = false; // To track loading state

    // Chatbot states
    let currentImageUrl = '';
    let chatInput = '';
    let isChatLoading = false;
    let chatError = '';
    type ChatMessage = { role: string; content: string | object | Array<{ type: string; image_url: { url: string } }> };
    let chatMessagesChat: ChatMessage[] = [];
    let chatMessagesBackend: ChatMessage[] = [
        { 
            role: "system",
            content: `
            You are an assistant helping a user with the text-to-image task. The user will upload a hand-sketched image. You are supposed to generate the following contents. Put a line break between each kind of contents:
            1, The detailed description of the uploaded image. Put it between labels <description> and </description>.
            2, Your feelings about the sketch. You should adjust it based on the following user feedback. You are encouraged to provide detailed and artistic feelings. Put it between labels <feeling> and </feeling>.
            3, Three or more suggestions about how to write the text-to-image prompt. Put each suggestion between labels <suggestion> and </suggestion>.
            4, The recommended prompt for Stable Diffusion based on the sketch and user feedback. Put it between labels <prompt> and </prompt>.
            `,
        },
    ]; 

    // Helper function to convert Blob to Base64 Data URL
    function blobToDataURL(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve(reader.result as string);
            };
            reader.onerror = () => {
                reject(new Error('Failed to convert blob to data URL.'));
            };
            reader.readAsDataURL(blob);
        });
    }

    // Function to fetch image description from OpenAI GPT via server API
    async function fetchImageDescriptionForGeneratedImage(imageUrl: string) {
        try {
            // Check if imageUrl is already a data URL
            let dataUrl: string;
            if (imageUrl.startsWith('data:')) {
                dataUrl = imageUrl;
            } else {
                // Fetch the image blob from the object URL
                const response = await fetch(imageUrl);
                if (!response.ok) {
                    throw new Error('Failed to fetch the image blob.');
                }
                const blob = await response.blob();
                // Convert the blob to a base64 data URL
                dataUrl = await blobToDataURL(blob);
            }

            // Call our server API instead of directly calling OpenAI
            const gptResponse = await fetch('/api/openai/describe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageDataUrl: dataUrl
                })
            });

            if (!gptResponse.ok) {
                const errorData = await gptResponse.json();
                throw new Error(errorData.error || 'Failed to fetch description from OpenAI');
            }

            const data = await gptResponse.json();
            return data.description;
            
        } catch (error) {
            // Replace "Analyzing image..." with an error message
            console.error('GPT API Error:', error);
            chatError = error instanceof Error ? error.message : 'An unknown error occurred.';
        } 
    }

    // Fetch image from Stability API based on user prompt and optional control image
    async function callStability(useControlImage: boolean = false): Promise<void> {
        if (!promptInputValue.trim()) {
            alert("Please enter a prompt.");
            return;
        }

        isImageGenLoading = true;
        error = '';
        api_response = null;
        console.log("Initial Prompt: ", promptInputValue);

        try {
            // Prepare form data for our server API
            const formData = new FormData();
            formData.append("prompt", promptInputValue.trim());
            formData.append("height", '1024');
            formData.append("width", '1024');
            formData.append("useControlImage", useControlImage.toString());

            if (control_image && useControlImage) {
                formData.append("controlImage", control_image);
            }

            // Call our server API instead of directly calling Stability AI
            const response = await fetch('/api/stability/generate', {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("API Error Response:", errorData);
                throw new Error(errorData.error || 'Failed to fetch image from Stability AI');
            }

            const data = await response.json();
            // Convert base64 data URL to blob URL
            const imageUrl = data.imageDataUrl;

            // Determine the category based on whether a control image was used
            let category: 'generated' | 'refined' = control_image ? 'refined' : 'generated';

            api_response = {
                category: category,
                prompt: promptInputValue.trim(),
                image_url: imageUrl,
                timestamp: new Date().toISOString()
            };

            // call GPT to get the description
            const description = await fetchImageDescriptionForGeneratedImage(imageUrl);

            // Add to history
            currentGeneratedImage = {
                imageUrl: imageUrl,
                timestamp: api_response.timestamp,
                prompt: api_response.prompt,
                description: description
            };
            generatedImages = [...generatedImages, currentGeneratedImage];
            
            
        } catch (err) {
            if (err instanceof Error) {
                error = err.message;
            } else {
                error = "An unknown error occurred";
            }
        } finally {
            isImageGenLoading = false;
            // Keep prompt in text box for easy modification
            // promptInputValue = ''; // Clear input after submission
            control_image = null; // Reset control image after submission
            if (canvas && imageElement) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            }
        }
        // console.log("current global messages: ", chatMessagesChat)
    }

    // Combine the original image and the canvas drawing into a single image
    async function getModifiedImage(): Promise<File | null> {
        if (!canvas || !imageElement) return null;

        // Create an off-screen canvas to combine image and drawings
        const offCanvas = document.createElement('canvas');
        const offCtx = offCanvas.getContext('2d');
        if (!offCtx) return null;

        offCanvas.width = imageElement.naturalWidth;
        offCanvas.height = imageElement.naturalHeight;

        // Draw the original image
        offCtx.drawImage(imageElement, 0, 0, offCanvas.width, offCanvas.height);

        // Draw the user's annotations scaled to the original image size
        offCtx.drawImage(canvas, 0, 0, offCanvas.width, offCanvas.height);

        // Convert to Blob and then to File
        return new Promise((resolve) => {
            offCanvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], "modified_image.png", { type: "image/png" });
                    resolve(file);
                } else {
                    resolve(null);
                }
            }, "image/png");
        });
    }

    // Handle drawing events
    function startDrawing(event: MouseEvent) {
        if (!imageElement) return;

        isDrawing = true;
        [lastX, lastY] = [event.offsetX, event.offsetY];

        // Save the current state before starting to draw
        // saveState();
    }

    function draw(event: MouseEvent) {
        if (!isDrawing) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // ctx.strokeStyle = '#FF0000'; // Drawing color
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = brushSize; // Dynamic brush size
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(event.offsetX, event.offsetY);
        ctx.stroke();
        [lastX, lastY] = [event.offsetX, event.offsetY];
    }

    function stopDrawing() {
        isDrawing = false;
        saveState();
    }

    // Save the current state of the canvas for undo functionality
    function saveState() {
        if (undoStack.length >= MAX_UNDO) {
            undoStack.shift(); // Remove the oldest state
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            undoStack.push(imageData);
        }
    }

    // Undo the last drawing action
    function undo() {
        if (undoStack.length === 0) return;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const imageData = undoStack.pop();
            if (imageData) {
                ctx.putImageData(imageData, 0, 0);
            }
        }
    }

    // Set up canvas dimensions to match the image
    function setupCanvas() {
        if (imageElement && canvas) {
            canvas.width = imageElement.clientWidth;
            canvas.height = imageElement.clientHeight;
        }
    }

    // Ensure canvas is set up when image loads
    function handleImageLoad() {
        setupCanvas();
    }

    // Handle keyboard shortcuts
    function handleKeyDown(event: KeyboardEvent) {
        console.log("Keydown event:", event);
        // Check for Ctrl+Z or Cmd+Z
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            console.log("Ctrl/Cmd + Z detected. Triggering undo.");
            event.preventDefault(); // Prevent the default browser undo
            undo();
        }
    }

    // Add and remove the keyboard event listener using onMount's cleanup
    onMount(() => {
        console.log("Component mounted. Adding keydown event listener.");
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            console.log("Component destroyed. Removing keydown event listener.");
        };
    });

    // Function to handle sending a message
    async function sendChatMessage() {
        const chatContainer = document.querySelector('.chat-messages');
        const chatInputBox = document.getElementById('chat-input-box');

        if (chatInput.trim() === '') return;

        // Add user message to chat
        chatMessagesChat = [...chatMessagesChat, { role: "user", content: chatInput as string }];
        chatMessagesBackend = [...chatMessagesBackend, { role: "user", content: chatInput as string }];

        // Store the current input and clear it
        const userMessage = chatInput;
        chatInput = '';
        chatError = '';
        isChatLoading = true;

        // Add a temporary "Typing..." message
        chatMessagesChat = [...chatMessagesChat, { role: "assistant", content: "Typing..." as string }];
        setTimeout(() => {
            if (chatContainer) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }, 100);

        try {
            // Call our server API instead of directly calling OpenAI
            const response = await fetch('/api/openai/completion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: chatMessagesBackend
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get completion from OpenAI');
            }

            const data = await response.json();

            // Remove the "Typing..." message
            chatMessagesChat.pop();
            
            const botResponse = data.content;
            chatMessagesChat = [...chatMessagesChat, { role: "assistant", content: botResponse }];
            chatMessagesBackend = [...chatMessagesBackend, { role: "assistant", content: botResponse }];

        } catch (error) {
            // Replace "Typing..." with an error message
            chatMessagesChat.pop();
            chatMessagesChat = [...chatMessagesChat, { role: "assistant", content: "Sorry, something went wrong. Please try again." }];
            console.error('GPT API Error:', error);
            chatError = error instanceof Error ? error.message : 'An unknown error occurred.';
        } finally {
            isChatLoading = false;
            // scroll to the bottom of the chat
            setTimeout(() => {
                if (chatContainer) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }, 100);
            setTimeout(() => {
                if (chatInputBox) {
                    chatInputBox.focus();
                }
            }, 100); 
        }
    }

    // Function to handle image upload
    async function uploadImage() {
      if (!imageFile) {
        alert("Please select an image to upload.");
        return;
      }
  
      imageLoading = true;
  
      try {
        // Call our server API instead of directly calling ImgBB
        const formData = new FormData();
        formData.append("image", imageFile);
  
        const response = await fetch("/api/imgbb/upload", {
          method: "POST",
          body: formData,
        });
  
        const data = await response.json();
  
        if (response.ok) {
          imageUrl = data.url; // ImgBB provides the URL
        } else {
          throw new Error(data.error || "Failed to upload image");
        }

        chatMessagesBackend = [...chatMessagesBackend, 
        {
            role: "user",
            content: [{
                type: "image_url",
                image_url: {url: imageUrl},
            }] as Array<{ type: string; image_url: { url: string } }>
        }];

        // instantly generate a description from chatgpt
        const chatContainer = document.querySelector('.chat-messages');
        const chatInputBox = document.getElementById('chat-input-box');
        chatMessagesChat = [...chatMessagesChat, { role: "assistant", content: "Typing..." as string }];
        setTimeout(() => {
            if (chatContainer) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }, 100);

        try {
            // Call our server API instead of directly calling OpenAI
            const completionResponse = await fetch('/api/openai/completion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: chatMessagesBackend
                })
            });

            if (!completionResponse.ok) {
                const errorData = await completionResponse.json();
                throw new Error(errorData.error || 'Failed to get completion from OpenAI');
            }

            const completionData = await completionResponse.json();

            // Remove the "Typing..." message
            chatMessagesChat.pop();
            
            const botResponse = completionData.content;
            chatMessagesChat = [...chatMessagesChat, { role: "assistant", content: botResponse }];
            chatMessagesBackend = [...chatMessagesBackend, { role: "assistant", content: botResponse }];

        } catch (error) {
            // Replace "Typing..." with an error message
            chatMessagesChat.pop();
            chatMessagesChat = [...chatMessagesChat, { role: "assistant", content: "Sorry, something went wrong. Please try again." }];
            console.error('GPT API Error:', error);
            chatError = error instanceof Error ? error.message : 'An unknown error occurred.';
        } finally {
            isChatLoading = false;
            // scroll to the bottom of the chat
            setTimeout(() => {
                if (chatContainer) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }, 100);
            setTimeout(() => {
                if (chatInputBox) {
                    chatInputBox.focus();
                }
            }, 100); 
        }
      } catch (error) {
        alert(`Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`);
      } finally {
        imageLoading = false;
      }
    }
  
    function handleFileChange(event: Event) {
        const target = event.target as HTMLInputElement;
        imageFile = target.files?.[0] || null;
    }

    function extractTextBetweenTags(inputText: string, tagName: string): string[] {
        // Convert input to string
        const text = String(inputText);
        
        // Escape special regex characters in tagName
        const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Construct a dynamic regular expression based on the tag name
        // Match opening tag, content (non-greedy), and closing tag
        const tagRegex = new RegExp(`<${escapedTagName}\\s*>([\\s\\S]*?)</${escapedTagName}\\s*>`, 'gi');
        let matches: string[] = [];
        let match;
        
        // Reset regex lastIndex to ensure we start from the beginning
        tagRegex.lastIndex = 0;
        
        // Iterate through all matches
        while ((match = tagRegex.exec(text)) !== null) {
            if (match[1] !== undefined) {
                // Get the content between tags
                let content = match[1];
                
                // Remove any nested or malformed tags of the same type
                // This handles cases where tags might be nested or malformed
                const nestedTagRegex = new RegExp(`<\\s*/?\\s*${escapedTagName}[^>]*>`, 'gi');
                content = content.replace(nestedTagRegex, '');
                
                // Clean up whitespace: normalize all whitespace to single spaces
                content = content.replace(/\s+/g, ' ');
                
                // Trim leading and trailing whitespace
                content = content.trim();
                
                // Only add if content is not empty and doesn't start with tag-like text
                if (content.length > 0 && !content.match(/^<\s*/)) {
                    matches.push(content);
                }
            }
        }

        return matches;
    }

    // Function to get the latest recommended prompt from assistant messages
    function getLatestRecommendedPrompt(): string | null {
        // Find the latest assistant message (excluding "Typing...")
        for (let i = chatMessagesChat.length - 1; i >= 0; i--) {
            const message = chatMessagesChat[i];
            if (message.role === "assistant") {
                // Check if content is a string and not "Typing..."
                const contentStr = typeof message.content === 'string' ? message.content : String(message.content);
                if (contentStr !== "Typing...") {
                    const prompts = extractTextBetweenTags(contentStr, "prompt");
                    if (prompts.length > 0) {
                        // Return the first (or combined) prompt
                        return prompts.join(" ");
                    }
                }
            }
        }
        return null;
    }

    // Function to apply the latest recommended prompt and generate image
    async function applyLatestRecommendedPrompt() {
        const recommendedPrompt = getLatestRecommendedPrompt();
        if (!recommendedPrompt) {
            alert("No recommended prompt available. Please wait for the assistant to provide a recommendation.");
            return;
        }

        // Set the prompt to the input field
        promptInputValue = recommendedPrompt;

        // Scroll to top before generating the image
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Generate the image
        await callStability(false);
    }

    // Check if there's a recommended prompt available
    function hasRecommendedPrompt(): boolean {
        return getLatestRecommendedPrompt() !== null;
    }

    // Handle feedback submission
    async function generateImageWithSketch() {
        if (!promptInputValue.trim()) {
            alert("Please enter your prompt.");
            return;
        }

        /*
        if (history.length === 0) {
            alert("Generate an image first before providing feedback.");
            return;
        }
        */

        // Get the last generated or refined image
        if (!currentGeneratedImage) {
            return;
        }
        const lastImageEntry = currentGeneratedImage;
        const lastImageUrl = currentGeneratedImage.imageUrl;

        // Fetch the blob from the last image URL
        const response = await fetch(lastImageUrl);
        const blob = await response.blob();

        // Get the modified image with annotations
        const modifiedImage = await getModifiedImage();
        if (!modifiedImage) {
            alert("Failed to create modified image.");
            return;
        }

        // Create a URL for the modified image
        const modifiedImageUrl = URL.createObjectURL(modifiedImage);

        // Add the modified image to history (Category 2)
        /*
        const modifiedApiResponse: ApiResponse = {
            category: 'modified',
            prompt: promptInputValue.trim(),
            image_url: modifiedImageUrl,
            timestamp: new Date().toISOString()
        };
        history = [...history, modifiedApiResponse];
        */

        // Set the modified image as the control image for the next API call
        control_image = modifiedImage;

        // Call the API to generate a new image based on the modified image
        await callStability(true);
    }
</script>

<style>
    :root {
        /* Modern Dark Mode Colors - More User Friendly */
        --bg-color: #1a1a1f;
        --bg-secondary: #252530;
        --text-color: #e8e8ed;
        --text-secondary: #b8b8c3;
        --text-muted: #90909a;
        --error-color: #ff6b82;
        --button-bg-color: #4a4a5a;
        --button-hover-color: #5a5a6a;
        --button-active-color: #6a6a7a;
        --button-disabled-color: #2a2a35;
        --button-primary-bg: #6366f1;
        --button-primary-hover: #7c7ef8;
        --undo-button-color: #ef4444;
        --undo-button-hover-color: #f87171;
        --bot-bg-color: #2d2d3a;
        --user-bg-color: #6366f1;
        --input-bg-color: #2d2d3a;
        --input-border-color: #3a3a4a;
        --input-focus-border: #6366f1;
        --border-color: #3a3a4a;
        --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.2);
        --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
        --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
    
        /* Modern Font Stack */
        --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
        --title-font-size: 2rem;
        --message-font-size: 1rem;
        --line-height: 1.6;
    }

    :global(html) {
        font-family: var(--font-family);
        background: linear-gradient(135deg, #1a1a1f 0%, #242429 100%);
        background-attachment: fixed;
        color: var(--text-color);
        transition: background-color 0.3s, color 0.3s;
        margin: 0;
        padding: 0;
        min-height: 100vh;
        line-height: var(--line-height);
        box-sizing: border-box;
        overflow-x: hidden;
    }

    :global(body) {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        overflow-x: hidden;
        width: 100%;
    }


    /* Parent container to hold both the image interaction and chatbot panes */
    .parent-container {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        gap: 24px;
        padding: 24px;
        flex-wrap: wrap;
        max-width: 1400px;
        margin: 0 auto;
        box-sizing: border-box;
    }

    /* Shared Box Styling */
    .box {
        background-color: var(--bg-secondary);
        padding: 24px 28px 28px 28px;
        border-radius: 16px;
        box-shadow: var(--shadow-md);
        border: 1px solid var(--border-color);
        flex: 1 1 300px;
        max-width: 800px;
        min-width: 250px;
        height: fit-content;
        transition: all 0.3s ease;
        box-sizing: border-box;
    }

    .box:hover {
        box-shadow: var(--shadow-lg);
        border-color: var(--input-focus-border);
    }

    /* Container and chatbot-pane inherit styles from .box */

    /* Title Styling */
    h1, h2, h3, h4 {
        font-family: var(--font-family);
        color: var(--text-color);
        font-weight: 600;
        letter-spacing: -0.02em;
    }

    h1, h2 {
        font-size: 2rem;
        text-align: center;
        margin-top: 0;
        margin-bottom: 24px;
        font-weight: 700;
        color: var(--text-color);
    }

    h3 {
        font-size: 1.25rem;
        margin-bottom: 12px;
        font-weight: 600;
    }

    h4 {
        font-size: 1.1rem;
        margin-top: 20px;
        margin-bottom: 8px;
        font-weight: 600;
        color: var(--text-color);
    }

    /* Chat Messages Styling */
    .chat-messages {
        max-height: 600px;
        overflow-y: auto;
        margin-bottom: 15px;
    }

    .chat-message {
        margin-bottom: 10px;
        display: flex;
        flex-direction: column;
    }

    .chat-message.user {
        align-items: flex-end;
    }

    .chat-message.bot {
        align-items: flex-start;
    }

    .chat-message p {
        padding: 12px 18px;
        border-radius: 18px;
        max-width: 75%;
        width: fit-content;
        word-wrap: break-word;
        word-break: normal;
        font-size: var(--message-font-size);
        font-family: var(--font-family);
        line-height: var(--line-height);
        box-sizing: border-box;
    }

    .bot-response {
        padding: 16px 18px;
        border-radius: 12px;
        max-width: 80%;
        width: 100%;
        word-wrap: break-word;
        word-break: normal;
        text-align: left;
        font-size: var(--message-font-size);
        font-family: var(--font-family);
        background-color: var(--bg-color);
        border: 1px solid var(--border-color);
        line-height: var(--line-height);
        box-sizing: border-box;
    }

    .bot-response h4 {
        text-align: left;
        margin-top: 12px;
        margin-bottom: 6px;
        margin-left: 0;
        margin-right: 0;
    }

    .bot-response h4:first-child {
        margin-top: 0;
    }

    .bot-response p {
        text-align: left;
        margin-bottom: 8px;
        margin-left: 0;
        margin-right: 0;
        padding-left: 0;
        padding-right: 0;
        max-width: 90%;
        width: 100%;
        box-sizing: border-box;
    }

    .chat-message.user p {
        background: linear-gradient(135deg, var(--user-bg-color) 0%, var(--button-primary-hover) 100%);
        color: white;
        box-shadow: var(--shadow-sm);
        text-align: left;
    }

    .chat-message.bot p {
        color: var(--text-color);
        background-color: var(--bg-color);
        text-align: left;
    }

    /* Input and Button Styling */
    .input-group, .chat-input {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    .chat-buttons {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    .chat-buttons button {
        flex: 1;
    }

    .button-container {
        display: flex;
        gap: 12px;
        align-items: stretch;
    }

    .button-container button {
        flex: 1;
        min-width: 0;
    }

    .apply-prompt-button {
        background-color: var(--button-bg-color);
    }

    .apply-prompt-button:hover:not(:disabled) {
        background-color: var(--button-hover-color);
    }

    .send-button {
        background-color: var(--button-primary-bg) !important;
    }

    .send-button:hover:not(:disabled) {
        background-color: var(--button-primary-hover) !important;
    }

    input[type="file"], .chat-input input[type="text"], textarea {
        padding: 14px 18px;
        border: 1px solid var(--input-border-color);
        border-radius: 12px;
        font-size: var(--message-font-size);
        transition: all 0.2s ease;
        font-family: var(--font-family);
        background-color: var(--input-bg-color);
        color: var(--text-color);
        line-height: var(--line-height);
    }

    input[type="file"]:focus, .chat-input input[type="text"]:focus, textarea:focus {
        border-color: var(--input-focus-border);
        outline: none;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        background-color: var(--bg-color);
    }

    textarea {
        resize: vertical;
        min-height: 100px;
    }

    button {
        padding: 12px 24px;
        background-color: var(--button-bg-color);
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: var(--font-family);
        box-shadow: var(--shadow-sm);
    }

    button:disabled {
        background-color: var(--button-disabled-color);
        cursor: not-allowed;
        opacity: 0.5;
        box-shadow: none;
    }

    button:hover:not(:disabled) {
        background-color: var(--button-hover-color);
        transform: translateY(-1px);
        box-shadow: var(--shadow-md);
    }

    button:active:not(:disabled) {
        transform: translateY(0);
        background-color: var(--button-active-color);
    }

    /* Specific Button Styling for Undo */
    .undo-button {
        background-color: var(--undo-button-color);
        border-radius: 20px; /* Uniform shape */
        font-size: 0.875rem;
        padding: 6px 12px;
    }

    .undo-button:disabled {
        background-color: #ffb3ab;
    }

    .undo-button:hover:not(:disabled) {
        background-color: var(--undo-button-hover-color);
    }

    /* Brush Controls */
    .brush-controls {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 10px;
    }

    .brush-controls label {
        font-size: 0.875rem;
        color: var(--text-color);
        font-family: var(--font-family);
        font-weight: 500;
    }

    .brush-controls input[type="range"] {
        width: 150px;
        accent-color: var(--button-primary-bg);
    }

    /* Response Styling */
    .response {
        text-align: left;
        margin-top: 30px;
    }

    .response p {
        color: var(--text-secondary);
        line-height: var(--line-height);
        margin-bottom: 12px;
    }

    .image-container {
        position: relative;
        display: inline-block;
    }

    .image-container img {
        max-width: 100%;
        height: auto;
        border-radius: 12px;
        box-shadow: var(--shadow-md);
        border: 1px solid var(--border-color);
    }

    canvas {
        position: absolute;
        top: 0;
        left: 0;
        cursor: crosshair;
    }

    /* Loading and Error Messages */
    .message {
        text-align: center;
        font-size: 1.125rem;
        color: var(--text-secondary);
        margin-top: 20px;
        padding: 16px;
        border-radius: 12px;
        background-color: var(--bg-color);
        border: 1px solid var(--border-color);
    }

    .error {
        color: var(--error-color);
        background-color: rgba(255, 107, 130, 0.1);
        border-color: var(--error-color);
    }

    /* History Overlay (for desktop) */
    .history-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 9998;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
    }

    .history-overlay.active {
        display: block;
        opacity: 1;
        pointer-events: auto;
    }

    /* Hide overlay on mobile */
    @media (max-width: 1000px) {
        .history-overlay {
            display: none !important;
        }
    }

    /* History Toggle Button (for desktop) */
    .history-toggle-button-desktop {
        display: none; /* Hidden by default, shown on desktop */
        position: absolute;
        top: 20px;
        left: 20px;
        z-index: 10;
        padding: 10px 14px;
        background-color: var(--button-bg-color);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        box-shadow: var(--shadow-md);
        transition: all 0.2s ease;
        pointer-events: auto;
    }

    .history-toggle-button-desktop:hover {
        background-color: var(--button-hover-color);
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
    }

    /* Container needs relative positioning for absolute button */
    .container {
        position: relative;
    }

    @media (min-width: 1001px) {
        .history-toggle-button-desktop {
            display: block;
        }

        /* Overlay should only be visible when active */
        .history-overlay.active {
            display: block;
        }

        /* History panel should be above overlay */
        .history.expanded {
            z-index: 9999 !important;
        }

        /* When history is expanded, disable pointer events on main content */
        .parent-container.history-overlay-active,
        .parent-container.history-overlay-active * {
            pointer-events: none !important;
        }

        /* But allow history panel and its contents to be clickable */
        .history.expanded,
        .history.expanded * {
            pointer-events: auto !important;
        }

        /* When history is expanded, history button should be behind overlay */
        .parent-container.history-overlay-active .history-toggle-button-desktop {
            z-index: 1 !important;
            pointer-events: none !important;
        }
    }

    /* History Styling */
    .history {
        margin-top: 40px;
        width: 15%;
        min-width: 200px;
        max-height: calc(100vh - 100px);
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 8px;
        position: relative;
        z-index: 1;
    }

    /* Desktop: History as side panel */
    @media (min-width: 1001px) {
        .history {
            position: fixed;
            top: 0;
            left: 0;
            width: 40%;
            max-width: 600px;
            height: 100vh;
            margin-top: 0;
            min-width: 0;
            background-color: var(--bg-secondary);
            z-index: 9999;
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            box-shadow: var(--shadow-lg);
            padding: 24px;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .history.expanded {
            transform: translateX(0);
        }

        .history-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border-color);
        }

        .history-header h3 {
            margin: 0;
            font-size: 1.5rem;
            flex: 1;
        }

        .history-close-button {
            display: block !important;
            padding: 10px 16px;
            background-color: var(--button-bg-color);
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            transition: all 0.2s ease;
            margin-left: 12px;
            min-width: 80px;
        }

        .history-close-button:hover {
            background-color: var(--button-hover-color);
            transform: translateY(-1px);
            box-shadow: var(--shadow-md);
        }

        .history-content {
            display: block;
        }

        /* Desktop: History items should be horizontal (image left, text right) */
        .history-item {
            flex-direction: row !important;
            align-items: flex-start;
            gap: 16px;
        }

        .history-item img {
            width: 150px;
            min-width: 150px;
            max-width: 150px;
            height: 150px;
            object-fit: contain; /* Show full image without cropping */
            flex-shrink: 0;
            border-radius: 8px;
            background-color: var(--bg-color); /* Background for transparent images */
            border: 1px solid var(--border-color);
        }

        .prompt-section {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            /* Ensure text has enough space */
        }

        .prompt-section .prompt {
            font-size: 0.9rem;
            line-height: 1.5;
            /* Show full prompt on desktop, no truncation */
        }

        /* Override truncation on desktop - show full prompt */
        .prompt-section .prompt-truncated {
            display: block !important;
            -webkit-line-clamp: none !important;
            line-clamp: none !important;
            -webkit-box-orient: horizontal !important;
            overflow: visible !important;
            text-overflow: clip !important;
        }

        .prompt-section .timestamp {
            font-size: 0.75rem;
            margin-top: 8px;
            display: block; /* Show timestamp on desktop */
        }
    }

    .history-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }

    .history-header h3 {
        margin: 0;
    }

    .history-toggle-button {
        display: none; /* Hidden on desktop, shown on mobile */
        padding: 6px 12px;
        font-size: 0.875rem;
        background-color: var(--button-bg-color);
        border: none;
        border-radius: 8px;
        color: white;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .history-toggle-button:hover {
        background-color: var(--button-hover-color);
    }

    .history-close-button {
        display: none; /* Hidden by default, shown in desktop when expanded */
    }

    .history-content {
        display: block; /* Always visible on desktop when expanded */
    }

    /* Custom scrollbar styling for history */
    .history::-webkit-scrollbar {
        width: 8px;
    }

    .history::-webkit-scrollbar-track {
        background: var(--bg-color);
        border-radius: 4px;
    }

    .history::-webkit-scrollbar-thumb {
        background: var(--button-bg-color);
        border-radius: 4px;
    }

    .history::-webkit-scrollbar-thumb:hover {
        background: var(--button-hover-color);
    }

    .history-item {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
        margin-bottom: 20px;
        padding: 14px;
        background-color: var(--bg-color);
        border-radius: 12px;
        box-shadow: var(--shadow-sm);
        border: 1px solid var(--border-color);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .history-item:hover {
        background-color: var(--bg-secondary);
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
        border-color: var(--input-focus-border);
    }


    .history-item img {
        width: 100%;
        height: auto;
        border-radius: 8px;
        object-fit: cover;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .prompt-section {
        /* color:black; */
        display: flex;
        flex-direction: column;
    }

    .prompt-section .prompt {
        font-size: 0.95rem;
        color: var(--text-color);
        margin: 0;
        font-family: var(--font-family);
        line-height: var(--line-height);
    }

    /* Desktop: show full prompt, no truncation (default behavior) */
    /* Mobile: truncate prompt - defined in media query */

    .type-and-download {
        display: flex;
        align-items: center;
        gap: 5px;
    }


    .timestamp {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 6px;
    }

    /* Responsive Design */
    @media (max-width: 1000px) {
        .parent-container {
            flex-direction: column;
            align-items: stretch;
            padding: 12px;
            gap: 12px;
            width: 100%;
            box-sizing: border-box;
        }

        .box {
            min-width: 0;
            max-width: 100%;
            flex: 1 1 auto;
            width: 100%;
            box-sizing: border-box;
            padding: 20px;
        }

        .container, .chatbot-pane {
            max-width: 100%;
            min-width: 0;
            flex: 1 1 auto;
            width: 100%;
            box-sizing: border-box;
        }

        /* Hide desktop history button on mobile */
        .history-toggle-button-desktop {
            display: none !important;
        }

        /* History in mobile: collapsible menu - match .box style */
        .history {
            position: relative !important;
            width: 100% !important;
            min-width: 0 !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important; /* Use parent gap instead */
            max-height: none !important;
            height: auto !important;
            transform: none !important;
            order: -1; /* Move to top */
            /* Match .box styling */
            background-color: var(--bg-secondary);
            padding: 12px 20px; /* Reduced vertical padding when collapsed */
            border-radius: 16px;
            box-shadow: var(--shadow-md);
            border: 1px solid var(--border-color);
            box-sizing: border-box;
            transition: all 0.3s ease; /* Match .box transition */
        }

        /* When expanded, use full padding */
        .history.expanded {
            padding: 20px;
        }

        /* Match .box hover effect */
        .history:hover {
            box-shadow: var(--shadow-lg);
            border-color: var(--input-focus-border);
        }

        .history-header {
            display: flex; /* Show header in mobile */
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0; /* Remove margin when collapsed */
            padding: 0; /* Remove padding - history container already has padding */
            background-color: transparent; /* No background - part of history container */
            border-radius: 0;
            border: none;
            box-shadow: none;
        }

        /* When expanded, add margin-bottom for spacing */
        .history.expanded .history-header {
            margin-bottom: 16px;
        }

        .history-header h3 {
            margin: 0;
            font-size: 1.2rem; /* Match h1 size in other modules */
            flex: 1;
            padding: 0;
            font-weight: 600;
        }

        .history-toggle-button {
            display: block; /* Show button in mobile */
            margin: 0;
            padding: 6px 12px;
            background-color: var(--button-bg-color);
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 0.875rem;
        }

        .history-toggle-button:hover {
            background-color: var(--button-hover-color);
            transform: translateY(-1px);
            box-shadow: var(--shadow-md);
        }

        .history-content {
            display: none; /* Hidden by default in mobile */
        }

        .history-content.expanded {
            display: block; /* Show when expanded */
            max-height: 380px; /* Limit to approximately 3 history items */
            overflow-y: auto; /* Enable scrolling when content exceeds */
            overflow-x: hidden;
            padding: 0; /* No padding - history container already has padding */
            margin-top: 0;
        }

        .history-item {
            flex-direction: row;
            gap: 12px;
            align-items: flex-start;
            margin-bottom: 12px;
            margin-right: 0; /* Remove right margin - container has padding */
            padding: 12px;
        }

        .history-item img {
            width: 80px;
            min-width: 80px;
            height: 80px;
            object-fit: cover;
            flex-shrink: 0;
        }

        .prompt-section {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
        }

        .prompt-section .prompt {
            font-size: 0.875rem;
            flex: 1;
        }

        .prompt-section .prompt-truncated {
            display: -webkit-box;
            -webkit-line-clamp: 3;
            line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .prompt-section .timestamp {
            display: none; /* Hide timestamp in mobile to save space */
        }
    }

    @media (max-width: 600px) {
        .parent-container {
            padding: 8px;
            gap: 8px;
            width: 100%;
            box-sizing: border-box;
        }

        .box {
            padding: 16px;
        }

        /* Match history padding with .box in smaller screens */
        .history {
            padding: 16px !important;
        }

        .container, .chatbot-pane {
            padding: 16px;
            margin: 0;
            box-sizing: border-box;
        }

        button, input[type="text"], input[type="file"], .brush-controls input[type="range"] {
            font-size: 0.875rem;
            padding: 10px 15px;
        }

        .history-item img {
            width: 70px;
            min-width: 70px;
            height: 70px;
        }

        .prompt-section .prompt {
            font-size: 0.8rem;
        }

        .brush-controls {
            flex-direction: column;
            align-items: flex-start;
        }
    
    }

    /* Link Styling */
    a {
        color: #7c7ef8;
        text-decoration: none;
        transition: color 0.2s ease;
    }

    a:hover {
        color: #9ca3f9;
        text-decoration: underline;
    }

    a:visited {
        color: #a5a6f6;
    }

</style>

<!-- History Overlay (Desktop) -->
<div 
    class="history-overlay" 
    class:active={isHistoryExpanded}
    on:click={handleOverlayClick}
    role="button"
    tabindex="0"
    on:keydown={(e) => { if (e.key === 'Escape') isHistoryExpanded = false; }}
></div>

<div class="parent-container" class:history-overlay-active={isHistoryExpanded}>
    <!-- History of generated and modified images -->
    <!--{#if generatedImages.length > 1}-->
        <div class="history" class:expanded={isHistoryExpanded}>
            <div class="history-header">
                <h3>History</h3>
                <button 
                    class="history-toggle-button"
                    on:click={() => isHistoryExpanded = !isHistoryExpanded}
                    aria-label={isHistoryExpanded ? "Collapse history" : "Expand history"}
                >
                    {isHistoryExpanded ? '▼' : '▶'}
                </button>
                <button 
                    class="history-close-button"
                    on:click={() => isHistoryExpanded = false}
                    aria-label="Close history"
                >
                    Close
                </button>
            </div>
            <div class="history-content" class:expanded={isHistoryExpanded}>
                {#each generatedImages.reverse() as item, index}
                    <div 
                        class="history-item" 
                        role="button"
                        tabindex="0"
                        on:click={(e) => handleHistoryItemClick(item, index, e)}
                        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleHistoryItemClick(item, index, e); } }}
                    >
                        <img src={item.imageUrl} alt="" />
                        <div class="prompt-section">
                            <p class="prompt prompt-truncated">Prompt: {item.prompt}</p>
                            <div class="type-and-download">
                            </div>
                            <p class="timestamp">Time: {new Date(item.timestamp).toLocaleString()}</p>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    <!--{/if}-->

    <!-- Existing Image Interaction Container -->
    <div class="container box">
        <!-- History Toggle Button (Desktop) - Inside Generate Image container -->
        <button 
            class="history-toggle-button-desktop"
            on:click={() => isHistoryExpanded = !isHistoryExpanded}
            aria-label={isHistoryExpanded ? "Close history" : "Open history"}
        >
            {isHistoryExpanded ? '✕' : '☰'} History
        </button>
        <h1>Generate Image</h1>

        <div class="input-group">
            
            <textarea
                bind:value={promptInputValue}
                placeholder="Image Prompt"
                aria-label="Image prompt"
                rows="5"
            ></textarea>
            
            <!--
            <input
                type="file"
                accept="image/*"
                on:change={handleImageUpload}
                aria-label="Upload control image (optional)"
            />
            <button on:click={callStability} disabled={is_loading}>
                {is_loading ? 'Generating...' : 'Generate'}
            </button>
            -->
            <div class="button-container">
                <button on:click={() => callStability(false)} disabled={isImageGenLoading}>
                    {isImageGenLoading ? 'Generating...' : 'Generate with Prompt'}
                </button>
                <button on:click={() => generateImageWithSketch()} disabled={isImageGenLoading || !currentGeneratedImage}>
                    {isImageGenLoading ? 'Generating...' : 'Generate with Prompt and Image'}
                </button>
            </div>
        </div>
        

        <!-- {#if control_image}
        <div class="uploaded-image-container">
            <h2>Uploaded Image Preview</h2>
            <div class="image-container">
                <img
                    bind:this={imageElement}
                    src={URL.createObjectURL(control_image)}
                    alt="Uploaded Image"
                    on:load={handleImageLoad}
                />
                <canvas
                    bind:this={canvas}
                    on:mousedown={startDrawing}
                    on:mousemove={draw}
                    on:mouseup={stopDrawing}
                    on:mouseout={stopDrawing}
                ></canvas>
            </div>
        </div>
        {/if} -->

        <!-- Feedback section 
        {#if history.length > 0}
            <div class="feedback-section">
                <h3>Refinement Feedback:</h3>
                <input
                    type="text"
                    bind:value={feedback_value}
                    placeholder="Modification Prompt"
                    aria-label="Feedback prompt"
                />
                <button on:click={submitFeedback} disabled={is_loading}>
                    {is_loading ? 'Refining...' : 'Submit Feedback'}
                </button>
            </div>
        {/if}
        -->

        <!-- Brush Controls and Undo Button -->
        <!--{#if history.length > 0}-->
            <div class="brush-controls">
                <label for="brushSize">Brush: {brushSize}px</label>
                <input
                    type="range"
                    id="brushSize"
                    min="1"
                    max="50"
                    bind:value={brushSize}
                    aria-label="Brush size slider"
                />
                <!--
                <button class="undo-button" on:click={undo} disabled={undoStack.length === 0}>
                    Undo
                </button>
                -->
            </div>
        <!--{/if}-->

        <!-- Display loading, error, or API response -->
        <!-- {#if is_loading && history.length === 0}
            <p class="message">Loading...</p> -->
        {#if ~(isImageGenLoading && history.length === 0) && error}
            <p class="message error">Error: {error}</p>
        {:else if currentGeneratedImage}
            <div class="response">
                <div class="image-container">
                    <img
                        bind:this={imageElement}
                        src={currentGeneratedImage.imageUrl}
                        alt=""
                        on:load={handleImageLoad}
                    />
                    <canvas
                        bind:this={canvas}
                        on:mousedown={startDrawing}
                        on:mousemove={draw}
                        on:mouseup={stopDrawing}
                        on:mouseout={stopDrawing}
                        on:blur={stopDrawing}
                    ></canvas>
                </div>
                <h4>Prompt</h4>
                <p>{currentGeneratedImage.prompt}</p>
                <h4>Image Description</h4>
                {#each extractTextBetweenTags(String(currentGeneratedImage.description), "description") as d}
                    <p>{d}</p>
                {/each}
                <h4>Details</h4>
                {#each extractTextBetweenTags(String(currentGeneratedImage.description), "bullet") as d}
                    <p>- {d}</p>
                {/each}
                <!--
                {#if globalOptimizedPrompt}
                <p class="optimized-prompt">Optimized Prompt: {globalOptimizedPrompt}</p>
                {/if}
                -->
            </div>
        <!-- {:else if history.length > 0}
            <div class="brush-controls">
                <label for="brushSize">Brush: {brushSize}px</label>
                <input
                    type="range"
                    id="brushSize"
                    min="1"
                    max="50"
                    bind:value={brushSize}
                    aria-label="Brush size slider"
                />
                <button class="undo-button" on:click={undo} disabled={undoStack.length === 0}>
                    Undo
                </button>
            </div> -->
        {/if}

    </div>

    <!-- Chatbot Pane -->
    <div class="chatbot-pane box">
        <!--{JSON.stringify(chatMessagesBackend)}  For debug -->
        <!-- Image upload -->
        <h2>Assistant</h2>
        <h3>Sketch Upload</h3>
        <p>You can upload a sketch image to help the assistant generate the image. The assistant will generate a description of the sketch and give you suggestions for the prompt.</p>
        <div class="image-upload-input">
            <input type="file" accept="image/*" on:change={handleFileChange} />
            <button on:click={uploadImage} disabled={imageLoading}>
                {imageLoading ? "Uploading..." : "Upload"}
            </button>
            {#if imageUrl}
            <h4>Uploaded Image:</h4>
            <img src={imageUrl} alt="" class="image-preview" style="max-width:50%"/>
            <p><strong>URL:</strong> <a href={imageUrl} target="_blank">{imageUrl}</a></p>
            {/if}
        </div>
        <div class="chat-messages">
            {#each chatMessagesChat as message}
                <div class="chat-message {message.role == "user" ? 'user' : 'bot'}">
                    {#if message.role == "assistant" && message.content != "Typing..."}
                        <div class="bot-response">
                            <h4>Sketch Description</h4>
                            {#each extractTextBetweenTags(String(message.content), "description") as d}
                                <p>{d}</p>
                            {/each}
                            <h4>Feelings about the Sketch</h4>
                            {#each extractTextBetweenTags(String(message.content), "feeling") as d}
                                <p>{d}</p>
                            {/each}
                            <h4>Suggestions for the Prompt</h4>
                            {#each extractTextBetweenTags(String(message.content), "suggestion") as d}
                                <p>- {d}</p>
                            {/each}
                            <h4>Suggested Prompt</h4>
                            {#each extractTextBetweenTags(String(message.content), "prompt") as d}
                                <p>{d}</p>
                            {/each} 
                        </div>
                    {/if}
                    {#if message.role == "user" || message.content == "Typing..."}
                        <p>{message.content}</p>
                    {/if}
                </div>
            {/each}
        </div>
        {#if chatError}
            <p class="chat-error">Error: {chatError}</p>
        {/if}
        <div class="chat-input">
            <textarea
                id="chat-input-box"
                bind:value={chatInput}
                placeholder="Type your message for suggestions from the assistant..."
                aria-label="Chat input"
                on:keydown={(e) => { if (e.key === 'Enter') sendChatMessage(); }}
                disabled={isChatLoading || imageLoading || imageUrl==""}
                rows="3" 
            ></textarea>
            <div class="chat-buttons">
                <button 
                    on:click={applyLatestRecommendedPrompt} 
                    disabled={isImageGenLoading || isChatLoading || !hasRecommendedPrompt()}
                    class="apply-prompt-button"
                    title="Apply the latest recommended prompt to Generate Image"
                >
                    {isImageGenLoading ? 'Generating...' : 'Apply Suggested Prompt'}
                </button>
                <button 
                    on:click={sendChatMessage} 
                    disabled={isChatLoading || imageLoading || imageUrl==""}
                    class="send-button"
                >
                    {isChatLoading ? 'Sending...' : 'Send'}
                </button>
            </div>
        </div>
    </div>
</div>