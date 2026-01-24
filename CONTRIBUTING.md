# Contributing to Shopify MCP Server

Thank you for your interest in contributing to the Shopify MCP Server! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- - npm or yarn
  - - A Shopify Partner account (for testing)
    - - Basic knowledge of TypeScript
     
      - ### Local Development Setup
     
      - 1. Fork the repository
        2. 2. Clone your fork:
           3.    ```bash
                    git clone https://github.com/YOUR_USERNAME/shopify-mcp.git
                    cd shopify-mcp
                    ```
                 3. Install dependencies:
                 4.    ```bash
                          npm install
                          ```
                       4. Create a `.env` file with your Shopify credentials (see `.env.example`)
                       5. 5. Run the development server:
                          6.    ```bash
                                   npm run dev
                                   ```

                                ## 📝 How to Contribute

                            ### Reporting Bugs

                          Before submitting a bug report:
                          - Check existing issues to avoid duplicates
                          - - Use the bug report template
                            - - Include clear steps to reproduce
                              - - Provide environment details (Node version, OS, etc.)
                               
                                - ### Suggesting Features
                               
                                - - Use the feature request template
                                  - - Explain the use case and benefits
                                    - - Consider how it fits with existing functionality
                                     
                                      - ### Submitting Pull Requests
                                     
                                      - 1. Create a new branch from `main`:
                                        2.    ```bash
                                                 git checkout -b feature/your-feature-name
                                                 ```
                                              2. Make your changes following our coding standards
                                              3. 3. Write or update tests as needed
                                                 4. 4. Ensure all tests pass:
                                                    5.    ```bash
                                                             npm test
                                                             ```
                                                          5. Commit with clear, descriptive messages
                                                          6. 6. Push and create a Pull Request
                                                            
                                                             7. ## 💻 Coding Standards
                                                            
                                                             8. ### TypeScript Guidelines
                                                            
                                                             9. - Use TypeScript strict mode
                                                                - - Prefer `const` over `let`
                                                                  - - Use meaningful variable and function names
                                                                    - - Add JSDoc comments for public APIs
                                                                      - - Keep functions small and focused
                                                                       
                                                                        - ### Code Style
                                                                       
                                                                        - - We use ESLint and Prettier for formatting
                                                                          - - Run `npm run lint` before committing
                                                                            - - Follow existing code patterns
                                                                             
                                                                              - ### Commit Messages
                                                                             
                                                                              - Use conventional commit format:
                                                                              - - `feat:` New features
                                                                                - - `fix:` Bug fixes
                                                                                  - - `docs:` Documentation changes
                                                                                    - - `refactor:` Code refactoring
                                                                                      - - `test:` Test additions/changes
                                                                                        - - `chore:` Maintenance tasks
                                                                                         
                                                                                          - Example: `feat: add bulk product update functionality`
                                                                                         
                                                                                          - ## 🧪 Testing
                                                                                         
                                                                                          - - Write tests for new functionality
                                                                                            - - Maintain existing test coverage
                                                                                              - - Run the full test suite before submitting PRs
                                                                                               
                                                                                                - ## 📚 Documentation
                                                                                               
                                                                                                - - Update README.md for user-facing changes
                                                                                                  - - Add JSDoc comments for new functions
                                                                                                    - - Update API documentation as needed
                                                                                                     
                                                                                                      - ## 🤝 Code of Conduct
                                                                                                     
                                                                                                      - Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).
                                                                                                     
                                                                                                      - ## 📄 License
                                                                                                     
                                                                                                      - By contributing, you agree that your contributions will be licensed under the MIT License.
                                                                                                     
                                                                                                      - ## 💬 Questions?
                                                                                                     
                                                                                                      - - Open a GitHub Discussion for general questions
                                                                                                        - - Check existing issues and discussions first
                                                                                                          - - Be respectful and patient with maintainers
                                                                                                           
                                                                                                            - Thank you for contributing! 🎉
