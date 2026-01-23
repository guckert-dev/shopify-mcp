# Security Policy

## Overview

LeMay ("we", "us", "our") is committed to ensuring the security and integrity of the Shopify MCP Server. This document outlines our security policies, vulnerability reporting procedures, and commitment to maintaining a secure codebase in accordance with industry best practices and applicable security standards.

## Supported Versions

| Version | Supported          | Security Updates |
| ------- | ------------------ | ---------------- |
| 1.x.x   | :white_check_mark: | Active           |

All releases receive security updates. We recommend always using the latest version.

## Security Standards Compliance

This project adheres to the following security principles and standards:

### Data Protection
- **No Credential Storage**: This MCP server does not store, log, or persist any Shopify API credentials, access tokens, or sensitive customer data
- - **In-Transit Encryption**: All communications with Shopify APIs use TLS 1.2+ encryption
  - - **Minimal Data Exposure**: The server operates on a need-to-know basis, only accessing data explicitly requested by the user
   
    - ### Code Security
    - - **Dependency Scanning**: Automated vulnerability scanning via Dependabot
      - - **Code Analysis**: Static code analysis for common security vulnerabilities
        - - **Secret Detection**: Automated scanning to prevent accidental credential exposure
          - - **Input Validation**: All inputs are validated using Zod schema validation
           
            - ### Access Control
            - - **Principle of Least Privilege**: The server requests only the minimum required Shopify API scopes
              - - **No Elevated Permissions**: No administrative or system-level access required
                - - **User-Controlled Authorization**: All Shopify store access requires explicit user authorization via OAuth
                 
                  - ## Reporting a Vulnerability
                 
                  - We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.
                 
                  - ### How to Report
                 
                  - **For sensitive security issues**, please use GitHub's Private Vulnerability Reporting feature:
                  - 1. Navigate to the Security tab of this repository
                    2. 2. Click "Report a vulnerability"
                       3. 3. Provide detailed information about the vulnerability
                         
                          4. **For general security concerns**, you may also contact us directly:
                          5. - **Email**: security@lemay.app
                             - - **Response Time**: We aim to acknowledge reports within 48 hours
                              
                               - ### What to Include
                              
                               - Please provide as much detail as possible:
                              
                               - - **Description**: Clear description of the vulnerability
                                 - - **Impact Assessment**: Potential impact and severity (Critical/High/Medium/Low)
                                   - - **Reproduction Steps**: Detailed steps to reproduce the issue
                                     - - **Affected Versions**: Which versions are affected
                                       - - **Proof of Concept**: Code snippets or screenshots (if applicable)
                                         - - **Suggested Fix**: Any recommendations for remediation (optional)
                                          
                                           - ### What to Expect
                                          
                                           - | Timeline | Action |
                                           - | -------- | ------ |
                                           - | 48 hours | Initial acknowledgment of your report |
                                           - | 7 days   | Preliminary assessment and severity determination |
                                           - | 30 days  | Target resolution for critical/high severity issues |
                                           - | 90 days  | Target resolution for medium/low severity issues |
                                          
                                           - ### Our Commitment
                                          
                                           - - We will not take legal action against security researchers acting in good faith
                                             - - We will work with you to understand and resolve the issue
                                               - - We will credit researchers (unless anonymity is requested) in our security advisories
                                                 - - We will notify affected users if a vulnerability impacts their security
                                                  
                                                   - ## Security Best Practices for Users
                                                  
                                                   - When using Shopify MCP Server, we recommend:
                                                  
                                                   - 1. **Keep Updated**: Always use the latest version of the server
                                                     2. 2. **Secure Credentials**: Store your Shopify API credentials securely using environment variables
                                                        3. 3. **Review Permissions**: Only grant the minimum required API scopes for your use case
                                                           4. 4. **Monitor Access**: Regularly review your Shopify app access logs
                                                              5. 5. **Report Issues**: Report any suspicious behavior immediately
                                                                
                                                                 6. ## Scope
                                                                
                                                                 7. This security policy applies to:
                                                                 8. - The Shopify MCP Server codebase
                                                                    - - Official releases published to this repository
                                                                      - - Documentation and configuration examples
                                                                       
                                                                        - This policy does **not** cover:
                                                                        - - Third-party dependencies (report to respective maintainers)
                                                                          - - Shopify's APIs or platform (report to Shopify directly)
                                                                            - - User implementations or customizations
                                                                             
                                                                              - ## Security Updates
                                                                             
                                                                              - Security updates are released as:
                                                                              - - **Patch releases** for critical and high severity issues
                                                                                - - **Minor releases** for medium and low severity issues
                                                                                 
                                                                                  - Subscribe to repository notifications to receive security update alerts.
                                                                                 
                                                                                  - ## Contact
                                                                                 
                                                                                  - - **Security Issues**: security@lemay.app
                                                                                    - - **General Inquiries**: travis.unitedstates@gmail.com
                                                                                      - - **Repository**: https://github.com/guckert-dev/shopify-mcp
                                                                                       
                                                                                        - ---

                                                                                        *This security policy is effective as of January 2026 and is reviewed quarterly.*

                                                                                        *© 2026 LeMay. All rights reserved.*
