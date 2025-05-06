import React from 'react';

interface FooterProps {
  repoUrl: string;
}

const Footer: React.FC<FooterProps> = ({ repoUrl }) => {
  return (
    <footer>
      <div>
        &copy; {new Date().getFullYear()} Decentralized Exchange. All rights reserved.
      </div>
      <div className="socials">
        <a href={repoUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
    </footer>
  );
};

export default Footer;
