import { Nav } from '@/components/navigation/Nav';
import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Stream ⭐',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main className="max-w-4xl mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-8">Terms of Service</h1>
          
          <p className="text-muted-foreground mb-6">
            <strong>Last updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <div className="space-y-8 text-foreground">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using Stream ⭐ ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these terms, then you may not access the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
              <p className="text-muted-foreground leading-relaxed">
                Stream ⭐ is an AI-native music platform that allows users to generate, collaborate, and discover music powered by artificial intelligence. The Service includes tools for creating AI artists, generating musical compositions, and sharing content with other users.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed">
                  To use certain features of the Service, you must register for an account. You agree to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide accurate, current, and complete information</li>
                  <li>Maintain and update your account information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Accept responsibility for all activities under your account</li>
                  <li>Notify us immediately of any unauthorized use</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. User Content</h2>
              <div className="space-y-4 text-muted-foreground">
                <div>
                  <h3 className="text-xl font-medium mb-2 text-foreground">4.1 Ownership</h3>
                  <p className="leading-relaxed">
                    You retain ownership of any content you create, upload, or share on the Service ("User Content"). However, by using the Service, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, and distribute your User Content for the purpose of operating and improving the Service.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-medium mb-2 text-foreground">4.2 Content Standards</h3>
                  <p className="leading-relaxed mb-2">
                    You agree not to upload, post, or transmit any User Content that:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Violates any applicable laws or regulations</li>
                    <li>Infringes on intellectual property rights</li>
                    <li>Contains harmful, offensive, or inappropriate material</li>
                    <li>Impersonates any person or entity</li>
                    <li>Contains viruses or malicious code</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. AI-Generated Content</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service uses artificial intelligence to generate music and create AI artists. You understand and agree that:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-4">
                <li>AI-generated content may not be unique and similar content may be generated for other users</li>
                <li>We do not guarantee the quality, accuracy, or originality of AI-generated content</li>
                <li>You are responsible for ensuring your use of AI-generated content complies with applicable laws</li>
                <li>AI-generated content may be used to improve our AI models</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service and its original content, features, and functionality are owned by Stream ⭐ and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of the Service without our prior written consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Prohibited Uses</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You agree not to use the Service:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>In any way that violates applicable laws or regulations</li>
                <li>To transmit spam, chain letters, or unsolicited communications</li>
                <li>To interfere with or disrupt the Service or servers</li>
                <li>To attempt to gain unauthorized access to any part of the Service</li>
                <li>To use automated systems to access the Service without permission</li>
                <li>To reverse engineer, decompile, or disassemble any part of the Service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Termination</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including if you breach these Terms. Upon termination, your right to use the Service will cease immediately. We may delete your account and content at any time after termination.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Disclaimer of Warranties</h2>
              <p className="text-muted-foreground leading-relaxed">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL STREAM ⭐, ITS AFFILIATES, OR THEIR RESPECTIVE OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR USE, ARISING OUT OF OR RELATING TO YOUR USE OF THE SERVICE.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">11. Indemnification</h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree to indemnify, defend, and hold harmless Stream ⭐ and its affiliates from any claims, damages, losses, liabilities, and expenses (including attorneys' fees) arising out of or relating to your use of the Service, your User Content, or your violation of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">12. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Stream ⭐ operates, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts in that jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">13. Changes to Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion. Your continued use of the Service after any changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">14. Contact Information</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about these Terms of Service, please contact us at:
              </p>
              <p className="text-muted-foreground mt-2">
                Email: legal@stream.app
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-border/50">
            <Link 
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

