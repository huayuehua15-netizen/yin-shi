import type { SalesCallRecord } from '../types/call';

export const SAMPLE_CALLS: SalesCallRecord[] = [
  {
    id: 'call-acme-q4',
    title: 'Q4 Enterprise Renewal & Seat Expansion',
    accountName: 'Acme Logistics Group',
    callDate: 'Nov 18, 2026',
    durationSec: 708,
    speakerARole: 'Jordan Vance (Account Executive)',
    speakerBRole: 'Elena Rostova (VP of Operations)',
    sourceType: 'sample',
    transcript: [
      {
        id: 'acme-1',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 0,
        endSec: 34,
        text: 'Elena, appreciate you making time before the holiday freeze. My goal for the next fifteen minutes is to review your team’s Q3 utilization metrics, confirm what is working for the Chicago and Dallas hubs, and align on seat counts for your Q4 renewal.',
        sentimentScore: 0.72,
        topicTag: 'Agenda & Framing',
      },
      {
        id: 'acme-2',
        speaker: 'Speaker B',
        speakerLabel: 'Elena Rostova',
        startSec: 35,
        endSec: 88,
        text: 'Sounds good, Jordan. Chicago and Dallas are running smoothly now—dispatchers actually cut exception escalations by about a third. That said, I need to be candid: finance is scrutinizing every SaaS renewal above eighty thousand this quarter.',
        sentimentScore: 0.25,
        topicTag: 'Proof & Budget Signal',
      },
      {
        id: 'acme-3',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 89,
        endSec: 142,
        text: 'A one-third drop in escalations across two hubs is significant. Before we touch commercial terms, help me understand what finance is measuring—is it total contract spend, or cost per active facility?',
        sentimentScore: 0.68,
        topicTag: 'Discovery',
      },
      {
        id: 'acme-4',
        speaker: 'Speaker B',
        speakerLabel: 'Elena Rostova',
        startSec: 143,
        endSec: 205,
        text: 'They look at year-over-year net increase. Last year we paid seventy-four thousand for forty seats. With the Phoenix hub onboarding in January, your renewal quote came back at ninety-eight thousand, which triggered an automatic CFO review.',
        sentimentScore: -0.15,
        topicTag: 'Renewal Friction',
      },
      {
        id: 'acme-5',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 206,
        endSec: 268,
        text: 'Got it. Looking at your usage logs, twenty-two of your current seats are heavy daily workflow users, while eighteen are view-only supervisors. We have a supervisor-lite tier we did not exist on your legacy plan—rebalancing those could lower your per-seat average.',
        sentimentScore: 0.62,
        topicTag: 'Commercial Creativity',
      },
      {
        id: 'acme-6',
        speaker: 'Speaker B',
        speakerLabel: 'Elena Rostova',
        startSec: 269,
        endSec: 334,
        text: 'Wait—nobody mentioned a view-only tier when Phoenix was scoped. If we reclassify the eighteen supervisors, what happens to the ninety-eight thousand number? Because right now I am also looking at consolidating onto our ERP vendor’s native module.',
        sentimentScore: -0.35,
        topicTag: 'Competitor & Price Objection',
      },
      {
        id: 'acme-7',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 335,
        endSec: 404,
        text: 'That brings the blended contract down closer to eighty-two thousand while adding fifteen full Phoenix licenses. On the ERP module—we hear that often when finance pushes consolidation. Have your dispatchers tested their mobile exception alerts yet?',
        sentimentScore: 0.55,
        topicTag: 'Objection Handling',
      },
      {
        id: 'acme-8',
        speaker: 'Speaker B',
        speakerLabel: 'Elena Rostova',
        startSec: 405,
        endSec: 472,
        text: 'We ran a two-day sandbox last month. Honestly, the ERP module lacks automated carrier re-routing, which is why my Dallas lead pushed back hard. But finance only sees two line items and asks why we cannot pick one.',
        sentimentScore: 0.44,
        topicTag: 'Differentiation',
      },
      {
        id: 'acme-9',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 473,
        endSec: 538,
        text: 'That gap is huge—if Dallas loses automated re-routing, how many hours a week go back onto manual phone triage? Last time we benchmarked that, it was roughly twelve hours per coordinator.',
        sentimentScore: 0.78,
        topicTag: 'Value Quantification',
      },
      {
        id: 'acme-10',
        speaker: 'Speaker B',
        speakerLabel: 'Elena Rostova',
        startSec: 539,
        endSec: 604,
        text: 'Easily ten to twelve hours per hub, plus overtime during peak freight weeks. Seeing eighty-two thousand paired with that overtime avoidance gives me a clean business case for our VP of Finance on Thursday.',
        sentimentScore: 0.86,
        topicTag: 'Champion Alignment',
      },
      {
        id: 'acme-11',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 605,
        endSec: 658,
        text: 'Perfect. Let me send you the revised two-tier order form and a one-page overtime comparison slide by three o’clock today so you have it ready before Thursday’s meeting.',
        sentimentScore: 0.81,
        topicTag: 'Next Steps',
      },
      {
        id: 'acme-12',
        speaker: 'Speaker B',
        speakerLabel: 'Elena Rostova',
        startSec: 659,
        endSec: 708,
        text: 'That works well. Send it over and I will ping you Friday morning with finance’s feedback.',
        sentimentScore: 0.79,
        topicTag: 'Commitment',
      },
    ],
    sentimentTimeline: [
      { timeSec: 0, engagement: 68, prospectSentiment: 66, repEnergy: 74, label: 'Strong agenda open' },
      { timeSec: 60, engagement: 74, prospectSentiment: 69, repEnergy: 75 },
      { timeSec: 120, engagement: 71, prospectSentiment: 58, repEnergy: 72 },
      { timeSec: 180, engagement: 59, prospectSentiment: 42, repEnergy: 69, milestoneType: 'dip', label: 'CFO review threshold ($98k)' },
      { timeSec: 240, engagement: 67, prospectSentiment: 61, repEnergy: 74 },
      { timeSec: 300, engagement: 54, prospectSentiment: 36, repEnergy: 70, milestoneType: 'objection', label: 'ERP consolidation threat' },
      { timeSec: 360, engagement: 73, prospectSentiment: 62, repEnergy: 76 },
      { timeSec: 420, engagement: 78, prospectSentiment: 68, repEnergy: 74 },
      { timeSec: 495, engagement: 89, prospectSentiment: 80, repEnergy: 79, milestoneType: 'peak', label: '12 hrs/wk manual triage anchor' },
      { timeSec: 565, engagement: 92, prospectSentiment: 87, repEnergy: 80 },
      { timeSec: 630, engagement: 86, prospectSentiment: 84, repEnergy: 77 },
      { timeSec: 708, engagement: 85, prospectSentiment: 83, repEnergy: 76, milestoneType: 'commitment', label: 'Thursday CFO review locked' },
    ],
    coaching: {
      summary:
        'Jordan navigated a tense renewal price objection and competitive consolidation threat with strong commercial flexibility, pivoting the prospect from sticker shock back to operational overtime savings.',
      strengths: [
        {
          title: 'Proactive agenda setting with clear outcome alignment',
          detail:
            'Opened by naming specific hub proof points (Chicago and Dallas) and securing agreement on the 15-minute call outcome before diving into numbers.',
          evidenceQuote:
            'My goal for the next fifteen minutes is to review your team’s Q3 utilization metrics, confirm what is working for the Chicago and Dallas hubs, and align on seat counts.',
          timestampSec: 0,
        },
        {
          title: 'Usage-backed commercial restructuring instead of flat discounting',
          detail:
            'Used real telemetry showing 18 view-only supervisors to introduce a supervisor-lite tier, cutting $16k off the quote without eroding core seat pricing.',
          evidenceQuote:
            'Looking at your usage logs, twenty-two of your current seats are heavy daily workflow users, while eighteen are view-only supervisors.',
          timestampSec: 206,
        },
        {
          title: 'Quantified competitive differentiation into labor hours',
          detail:
            'Rather than bashing the ERP vendor, asked about their sandbox test and translated the missing automated re-routing into 10–12 coordinator hours saved weekly.',
          evidenceQuote:
            'If Dallas loses automated re-routing, how many hours a week go back onto manual phone triage?',
          timestampSec: 473,
        },
      ],
      missedOpportunities: [
        {
          title: 'Did not ask to join or multi-thread into the Thursday finance review',
          detail:
            'Accepted relying on Elena to pitch the VP of Finance solo instead of offering a 10-minute executive walkthrough or asking what objections the VP of Finance raises first.',
          evidenceQuote:
            'Seeing eighty-two thousand paired with that overtime avoidance gives me a clean business case for our VP of Finance on Thursday.',
          timestampSec: 539,
        },
        {
          title: 'Missed confirming exact ERP contract timing and switching cost',
          detail:
            'When Elena brought up the ERP native module, Jordan moved straight to feature comparison without asking when the ERP renewal occurs or who owns that decision.',
          evidenceQuote:
            'Right now I am also looking at consolidating onto our ERP vendor’s native module.',
          timestampSec: 269,
        },
        {
          title: 'Left Phoenix hub go-live dependencies unexplored',
          detail:
            'Included 15 Phoenix licenses in the revised $82k quote without confirming Phoenix’s January implementation lead, IT readiness, or signature cutoff date.',
          evidenceQuote:
            'With the Phoenix hub onboarding in January, your renewal quote came back at ninety-eight thousand.',
          timestampSec: 143,
        },
      ],
      nextStepRecommendation:
        'Send the $82k two-tier order form plus a 3-bullet CFO ROI brief by 3:00 PM today, and propose a brief 10-minute joint check-in with the VP of Finance on Wednesday afternoon prior to Thursday’s internal review.',
    },
  },
  {
    id: 'call-northstar-disc',
    title: 'Inbound Discovery — Fleet Telemetry Rollout',
    accountName: 'Northstar Freight Partners',
    callDate: 'Nov 15, 2026',
    durationSec: 515,
    speakerARole: 'Jordan Vance (Account Executive)',
    speakerBRole: 'Marcus Chen (Director of Supply Chain)',
    sourceType: 'sample',
    transcript: [
      {
        id: 'ns-1',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 0,
        endSec: 42,
        text: 'Hey Marcus, thanks for requesting a demo through our website. Before I show you the platform, what prompted you to reach out this week?',
        sentimentScore: 0.65,
        topicTag: 'Opening Question',
      },
      {
        id: 'ns-2',
        speaker: 'Speaker B',
        speakerLabel: 'Marcus Chen',
        startSec: 43,
        endSec: 108,
        text: 'We acquired two regional cold-chain carriers in October, so now we are running three separate dispatch spreadsheets and missing detention billing deadlines.',
        sentimentScore: 0.45,
        topicTag: 'Trigger Event',
      },
      {
        id: 'ns-3',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 109,
        endSec: 224,
        text: 'Oh, we solve that out of the box! Let me share my screen and walk through our unified intake engine, our automated detention timer, our carrier scorecard API, and our custom webhook builder—so here on the left rail you can configure rules per region...',
        sentimentScore: 0.2,
        topicTag: 'Premature Feature Pitch',
      },
      {
        id: 'ns-4',
        speaker: 'Speaker B',
        speakerLabel: 'Marcus Chen',
        startSec: 225,
        endSec: 278,
        text: 'Okay, yeah, that looks thorough. Though honestly, our biggest headache right now isn’t configuring rules—it is that the two acquired teams refuse to leave their legacy ELD hardware.',
        sentimentScore: -0.25,
        topicTag: 'Hardware Constraint',
      },
      {
        id: 'ns-5',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 279,
        endSec: 346,
        text: 'Good catch—we integrate natively with Samsara, Motive, and Omnitracs without swapping hardware. Which ELD systems are those two carriers using today?',
        sentimentScore: 0.61,
        topicTag: 'Recovery & Technical Fit',
      },
      {
        id: 'ns-6',
        speaker: 'Speaker B',
        speakerLabel: 'Marcus Chen',
        startSec: 347,
        endSec: 416,
        text: 'One is on Motive and the other is on an older Omnitracs setup. Knowing we don’t have to rip and replace trucks takes a massive blocker off the table.',
        sentimentScore: 0.78,
        topicTag: 'Relief & Engagement Lift',
      },
      {
        id: 'ns-7',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 417,
        endSec: 468,
        text: 'Awesome. I will shoot over our Motive and Omnitracs integration docs and let’s reconnect next Tuesday with your IT lead to plan a pilot.',
        sentimentScore: 0.7,
        topicTag: 'Next Step',
      },
      {
        id: 'ns-8',
        speaker: 'Speaker B',
        speakerLabel: 'Marcus Chen',
        startSec: 469,
        endSec: 515,
        text: 'Sounds fine, send the calendar invite for Tuesday afternoon and I will check if IT is free.',
        sentimentScore: 0.52,
        topicTag: 'Soft Commitment',
      },
    ],
    sentimentTimeline: [
      { timeSec: 0, engagement: 72, prospectSentiment: 68, repEnergy: 74, label: 'Clean inbound trigger question' },
      { timeSec: 75, engagement: 76, prospectSentiment: 64, repEnergy: 75 },
      { timeSec: 155, engagement: 48, prospectSentiment: 44, repEnergy: 84, milestoneType: 'dip', label: '2-minute uninterrupted feature dump' },
      { timeSec: 245, engagement: 43, prospectSentiment: 38, repEnergy: 70, milestoneType: 'objection', label: 'Legacy ELD hardware concern' },
      { timeSec: 315, engagement: 69, prospectSentiment: 65, repEnergy: 73 },
      { timeSec: 385, engagement: 84, prospectSentiment: 80, repEnergy: 75, milestoneType: 'peak', label: 'No rip-and-replace relief' },
      { timeSec: 455, engagement: 70, prospectSentiment: 62, repEnergy: 72 },
      { timeSec: 515, engagement: 64, prospectSentiment: 57, repEnergy: 70, milestoneType: 'commitment', label: 'Tentative Tuesday IT follow-up' },
    ],
    coaching: {
      summary:
        'Jordan uncovered a clear M&A trigger event early and recovered well on ELD compatibility, but lost momentum mid-call by jumping into a two-minute screen-share monologue before finishing discovery.',
      strengths: [
        {
          title: 'Direct trigger-event opening question',
          detail:
            'Instead of launching directly into slides, asked what prompted the inbound demo request, immediately surfacing the October cold-chain acquisition.',
          evidenceQuote:
            'Before I show you the platform, what prompted you to reach out this week?',
          timestampSec: 0,
        },
        {
          title: 'Fast hardware compatibility reassurance',
          detail:
            'Pivoted smoothly when Marcus raised ELD resistance, naming supported platforms directly and removing a perceived rip-and-replace barrier.',
          evidenceQuote:
            'We integrate natively with Samsara, Motive, and Omnitracs without swapping hardware. Which ELD systems are those two carriers using today?',
          timestampSec: 279,
        },
        {
          title: 'Recognized the need for technical multi-threading',
          detail:
            'Identified that IT would be required for a Motive/Omnitracs pilot and proposed bringing them into the next call.',
          evidenceQuote:
            'Let’s reconnect next Tuesday with your IT lead to plan a pilot.',
          timestampSec: 417,
        },
      ],
      missedOpportunities: [
        {
          title: 'Jumped into a 2-minute feature monologue after one pain point',
          detail:
            'Started screen-sharing four different modules immediately after hearing "missed detention billing," causing prospect engagement to drop 28 points.',
          evidenceQuote:
            'Let me share my screen and walk through our unified intake engine, our automated detention timer, our carrier scorecard API, and our custom webhook builder...',
          timestampSec: 109,
        },
        {
          title: 'Never quantified the revenue lost to unbilled detention',
          detail:
            'Missed asking how much detention revenue goes uncollected per month, leaving the upcoming pilot without a measurable financial success metric.',
          evidenceQuote:
            'We are running three separate dispatch spreadsheets and missing detention billing deadlines.',
          timestampSec: 43,
        },
        {
          title: 'Accepted a tentative "I will check" close instead of locking IT on the call',
          detail:
            'Ended with a soft commitment to check IT availability rather than confirming the IT lead’s name and priority timeline.',
          evidenceQuote:
            'Send the calendar invite for Tuesday afternoon and I will check if IT is free.',
          timestampSec: 469,
        },
      ],
      nextStepRecommendation:
        'Before Tuesday’s technical call, send a 2-minute Motive/Omnitracs architecture brief and ask Marcus for an estimate of monthly missed detention fees so you can anchor pilot success criteria.',
    },
  },
  {
    id: 'call-veridian-sec',
    title: 'Security & Procurement Review',
    accountName: 'Veridian Health Systems',
    callDate: 'Nov 12, 2026',
    durationSec: 850,
    speakerARole: 'Jordan Vance (Account Executive)',
    speakerBRole: 'Priya Nair (Chief Information Security Officer)',
    sourceType: 'sample',
    transcript: [
      {
        id: 'ver-1',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 0,
        endSec: 48,
        text: 'Priya, thank you for reviewing our SOC 2 Type II packet ahead of today’s call. Where would you like to focus our security review first?',
        sentimentScore: 0.71,
        topicTag: 'Executive Framing',
      },
      {
        id: 'ver-2',
        speaker: 'Speaker B',
        speakerLabel: 'Priya Nair',
        startSec: 49,
        endSec: 132,
        text: 'Two items: data residency guarantees for HIPAA-adjacent transit logs, and whether your audio ingestion pipeline retains raw payloads beyond processing.',
        sentimentScore: 0.3,
        topicTag: 'Compliance Requirements',
      },
      {
        id: 'ver-3',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 133,
        endSec: 240,
        text: 'We deploy dedicated US-East single-tenant encryption keys via customer-managed KMS, and our ingestion worker supports zero-retention ephemeral processing. I can have our Head of Security sign the BAA addendum tomorrow.',
        sentimentScore: 0.84,
        topicTag: 'Compliance Proof',
      },
      {
        id: 'ver-4',
        speaker: 'Speaker B',
        speakerLabel: 'Priya Nair',
        startSec: 241,
        endSec: 340,
        text: 'Zero-retention ephemeral processing plus customer-managed KMS checks both of my non-negotiables. What does your procurement legal redline turnaround usually look like?',
        sentimentScore: 0.82,
        topicTag: 'Buying Signal',
      },
      {
        id: 'ver-5',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 341,
        endSec: 440,
        text: 'Typically three to five business days once redlines hit our general counsel. Let’s send the MSA over to your procurement desk today.',
        sentimentScore: 0.72,
        topicTag: 'Legal Process',
      },
      {
        id: 'ver-6',
        speaker: 'Speaker B',
        speakerLabel: 'Priya Nair',
        startSec: 441,
        endSec: 530,
        text: 'Good—note that our Q4 vendor onboarding freeze starts December 4th, so anything not counter-signed by then slips to February.',
        sentimentScore: 0.48,
        topicTag: 'Deadline Disclosure',
      },
      {
        id: 'ver-7',
        speaker: 'Speaker A',
        speakerLabel: 'Jordan Vance',
        startSec: 531,
        endSec: 650,
        text: 'Understood, December 4th is plenty of time—we will get the MSA and BAA into your inbox this afternoon.',
        sentimentScore: 0.62,
        topicTag: 'Closing',
      },
    ],
    sentimentTimeline: [
      { timeSec: 0, engagement: 70, prospectSentiment: 65, repEnergy: 72 },
      { timeSec: 110, engagement: 74, prospectSentiment: 56, repEnergy: 73 },
      { timeSec: 220, engagement: 88, prospectSentiment: 84, repEnergy: 78, milestoneType: 'peak', label: 'Zero-retention + KMS confirmed' },
      { timeSec: 340, engagement: 86, prospectSentiment: 83, repEnergy: 76 },
      { timeSec: 480, engagement: 79, prospectSentiment: 68, repEnergy: 72, milestoneType: 'dip', label: 'Dec 4 procurement freeze warning' },
      { timeSec: 650, engagement: 78, prospectSentiment: 72, repEnergy: 73, milestoneType: 'commitment', label: 'MSA + BAA delivery aligned' },
    ],
    coaching: {
      summary:
        'Jordan cleared CISO technical hurdles decisively with exact KMS and BAA answers, though under-estimated the urgency of the December 4th vendor onboarding freeze.',
      strengths: [
        {
          title: 'Credible, concise security answers without fluff',
          detail:
            'Addressed both US-East customer-managed KMS and zero-retention ephemeral processing in under two minutes.',
          evidenceQuote:
            'We deploy dedicated US-East single-tenant encryption keys via customer-managed KMS, and our ingestion worker supports zero-retention ephemeral processing.',
          timestampSec: 133,
        },
        {
          title: 'Opened with prospect priority agenda',
          detail:
            'Acknowledged Priya had already reviewed the SOC 2 packet and let her steer straight to her highest-risk topics.',
          evidenceQuote:
            'Where would you like to focus our security review first?',
          timestampSec: 0,
        },
        {
          title: 'Offered executive security sponsorship immediately',
          detail:
            'Proactively committed Head of Security sign-off on the BAA addendum to prevent legal bottlenecks.',
          evidenceQuote:
            'I can have our Head of Security sign the BAA addendum tomorrow.',
          timestampSec: 133,
        },
      ],
      missedOpportunities: [
        {
          title: 'Treated the December 4th freeze casually instead of building a mutual close plan',
          detail:
            'Brushed past the hard freeze deadline with "plenty of time" rather than working backward through legal review, infosec sign-off, and purchase order issuance dates.',
          evidenceQuote:
            'Understood, December 4th is plenty of time—we will get the MSA and BAA into your inbox this afternoon.',
          timestampSec: 531,
        },
        {
          title: 'Did not confirm procurement owner’s name or SLA',
          detail:
            'Agreed to send the MSA to procurement without asking who specifically owns the queue or whether they use Veridian’s paper vs. vendor MSA.',
          evidenceQuote:
            'Let’s send the MSA over to your procurement desk today.',
          timestampSec: 341,
        },
        {
          title: 'Missed asking for a verbal security approval email',
          detail:
            'With Priya confirming both non-negotiables passed, Jordan could have asked her to send a quick thumbs-up note to the procurement lead to fast-track legal review.',
          evidenceQuote:
            'Zero-retention ephemeral processing plus customer-managed KMS checks both of my non-negotiables.',
          timestampSec: 241,
        },
      ],
      nextStepRecommendation:
        'Attach a reverse-chronology mutual action plan working back from December 4th alongside the MSA/BAA today, and ask Priya to cc her procurement owner on a brief security sign-off confirmation.',
    },
  },
];
